import json
import os
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

from models import CompanyInput, Job, RunMetadata, UnresolvedCompany

load_dotenv(override=True)

_URL = (os.getenv("SUPABASE_URL") or "").rstrip("/")
_KEY = (os.getenv("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
_BASE = f"{_URL}/rest/v1"

_STATUS_MAP = {
    "running":   "RUNNING",
    "completed": "SUCCEEDED",
    "failed":    "FAILED",
}

_BATCH_SIZE = 50
_READ_PAGE_SIZE = 1000


def _headers(extra: dict | None = None) -> dict:
    h = {
        "apikey": _KEY,
        "Authorization": f"Bearer {_KEY}",
        "Content-Type": "application/json",
    }
    if extra:
        h.update(extra)
    return h


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _to_bool(is_remote: str) -> bool | None:
    if is_remote == "Yes":
        return True
    if is_remote == "No":
        return False
    return None


def _to_date(value: str, fallback: str = "") -> str | None:
    """Return value if non-empty, else fallback, else None.

    Used so date_updated falls back to date_published when blank.
    """
    v = value.strip() if value else ""
    if v:
        return v
    fb = fallback.strip() if fallback else ""
    return fb if fb else None


def _post_batch(endpoint: str, records: list[dict], prefer: str) -> None:
    for i in range(0, len(records), _BATCH_SIZE):
        batch = records[i:i + _BATCH_SIZE]
        resp = requests.post(
            f"{_BASE}/{endpoint}",
            headers=_headers({"Prefer": prefer}),
            json=batch,
            timeout=30,
        )
        resp.raise_for_status()


def read_scrape_list() -> list[CompanyInput]:
    """Read companies to scrape from the Supabase scrape table."""
    companies = []
    offset = 0

    while True:
        resp = requests.get(
            f"{_BASE}/scrape",
            headers=_headers(),
            params={
                "select": "company,keywords,api",
                "order": "company.asc",
                "limit": _READ_PAGE_SIZE,
                "offset": offset,
            },
            timeout=15,
        )
        resp.raise_for_status()

        payload = resp.json()
        if not isinstance(payload, list):
            raise ValueError("Supabase returned an unexpected scrape payload")

        for row in payload:
            name = str(row.get("company") or "").strip()
            if not name:
                continue
            raw_kw = str(row.get("keywords") or "").strip()
            keywords = [k.strip() for k in raw_kw.split(",") if k.strip()]
            api_url = str(row.get("api") or "").strip()
            companies.append(CompanyInput(
                name=name,
                keywords=keywords,
                api_url=api_url,
                record_id=name,  # scrape PK is company name; used for cache updates
            ))

        if len(payload) == 0:
            break

        offset += len(payload)

    print(f"  Supabase: {len(companies)} companies loaded")
    return companies

def update_scrape_api_url(company: str, api_url: str) -> None:
    """Cache the resolved ATS API URL back on the scrape row."""
    if not company or not api_url:
        return
    resp = requests.patch(
        f"{_BASE}/scrape",
        headers=_headers({"Prefer": "return=minimal"}),
        params={"company": f"eq.{company}"},
        json={"api": api_url},
        timeout=15,
    )
    resp.raise_for_status()


def upsert_companies_api(company: str, api_url: str) -> None:
    """Persist a confirmed company → ATS API URL mapping to companies_api."""
    if not company or not api_url:
        return
    resp = requests.post(
        f"{_BASE}/companies_api",
        headers=_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
        json={"company": company, "api": api_url},
        timeout=15,
    )
    resp.raise_for_status()


def _job_to_row(job: Job, run_id: str, now: str) -> dict:
    date_pub = _to_date(job.date_published)
    date_upd = _to_date(job.date_updated, fallback=job.date_published)
    return {
        "job_url": job.job_url,
        "company": job.company,
        "job_title": job.job_title,
        "department": job.department or None,
        "job_description": job.job_description or None,
        "location": job.location or None,
        "salary": job.salary or None,
        "is_remote": _to_bool(job.is_remote),
        "workplace_type": job.workplace_type or None,
        "date_published": date_pub,
        "date_updated": date_upd,
        "ats": job.ats,
        "is_listed": True,
        "last_seen_at": now,
        "last_seen_run_id": run_id,
    }


def upsert_jobs(jobs: list[Job], run_id: str) -> None:
    """Upsert jobs into Supabase. On conflict (job_url), all columns are overwritten."""
    if not jobs:
        return
    now = _now_iso()
    rows = [_job_to_row(job, run_id, now) for job in jobs]
    _post_batch("jobs", rows, "resolution=merge-duplicates,return=minimal")
    print(f"  Supabase: {len(rows)} jobs upserted")


def append_observations(jobs: list[Job], run_id: str) -> None:
    """Append one observation row per job for the current run."""
    if not jobs:
        return
    now = _now_iso()
    records = []
    for job in jobs:
        date_pub = _to_date(job.date_published)
        date_upd = _to_date(job.date_updated, fallback=job.date_published)
        records.append({
            "run_id": run_id,
            "observed_at": now,
            "job_url": job.job_url,
            "company": job.company,
            "job_title": job.job_title,
            "location": job.location or None,
            "department": job.department or None,
            "salary": job.salary or None,
            "date_published": date_pub,
            "date_updated": date_upd,
            "ats": job.ats,
            "is_remote": _to_bool(job.is_remote),
            "workplace_type": job.workplace_type or None,
        })
    _post_batch("job_observations", records, "return=minimal")
    print(f"  Supabase: {len(records)} observations appended")


def start_run(metadata: RunMetadata, dry_run: bool) -> None:
    """Insert a scrape_runs row with status RUNNING at pipeline start."""
    resp = requests.post(
        f"{_BASE}/scrape_runs",
        headers=_headers({"Prefer": "return=minimal"}),
        json={
            "run_id": metadata.run_id,
            "started_at": metadata.started_at,
            "finished_at": metadata.started_at,
            "status": "RUNNING",
            "input_path": "supabase:scrape",
            "dry_run": dry_run,
            "total_companies": 0,
            "matched_companies": 0,
            "jobs_seen": 0,
            "unresolved_count": 0,
            "error_count": 0,
        },
        timeout=15,
    )
    resp.raise_for_status()
    print(f"  Supabase: run {metadata.run_id} started")


def finish_run(metadata: RunMetadata, dry_run: bool) -> None:
    """Update scrape_runs with final status and counts at pipeline end."""
    status = _STATUS_MAP.get(metadata.status, "FAILED")
    resp = requests.patch(
        f"{_BASE}/scrape_runs",
        headers=_headers({"Prefer": "return=minimal"}),
        params={"run_id": f"eq.{metadata.run_id}"},
        json={
            "finished_at": metadata.finished_at,
            "status": status,
            "total_companies": metadata.total_companies,
            "matched_companies": metadata.matched_companies,
            "jobs_seen": metadata.jobs_seen,
            "unresolved_count": metadata.unresolved_count,
            "error_count": metadata.error_count,
        },
        timeout=15,
    )
    resp.raise_for_status()
    print(f"  Supabase: run {metadata.run_id} finished ({status})")


def record_unresolved(companies: list[UnresolvedCompany], run_id: str) -> None:
    """Insert unresolved company rows for the current run."""
    if not companies:
        return
    records = [
        {
            "run_id": run_id,
            "company_name": c.company_name,
            "slug_attempts": json.dumps(c.slug_attempts),
            "ats_attempts": json.dumps(c.ats_attempts),
            "reason": c.reason,
        }
        for c in companies
    ]
    _post_batch("unresolved_companies", records, "return=minimal")
    print(f"  Supabase: {len(records)} unresolved companies recorded")


def record_errors(errors: list[dict], run_id: str) -> None:
    """Insert error rows for the current run."""
    if not errors:
        return
    records = [
        {
            "run_id": run_id,
            "stage": e.get("stage", ""),
            "message": e.get("message", ""),
            "company_name": e.get("company_name") or None,
            "ats": e.get("ats") or None,
            "fatal": e.get("fatal", False),
        }
        for e in errors
    ]
    _post_batch("run_errors", records, "return=minimal")
    print(f"  Supabase: {len(records)} errors recorded")


def persist_run_artifacts(
    metadata: RunMetadata,
    unresolved: list[UnresolvedCompany],
    errors: list[dict],
    run_id: str,
    dry_run: bool,
) -> list[str]:
    """Persist run metadata and artifacts with independent failure paths.

    Returns warning messages for any failed persistence step. A failure in one
    step does not prevent subsequent steps from being attempted.
    """
    warnings: list[str] = []

    try:
        finish_run(metadata, dry_run=dry_run)
    except Exception as exc:
        warnings.append(f"finish_run failed: {exc}")

    try:
        if unresolved:
            record_unresolved(unresolved, run_id)
    except Exception as exc:
        warnings.append(f"record_unresolved failed: {exc}")

    try:
        if errors:
            record_errors(errors, run_id)
    except Exception as exc:
        warnings.append(f"record_errors failed: {exc}")

    return warnings
