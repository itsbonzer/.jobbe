import io
import pathlib
import sys
from contextlib import redirect_stdout


JOBBE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(JOBBE_DIR) not in sys.path:
    sys.path.insert(0, str(JOBBE_DIR))

import runner
from company_worker import CompanyResult
from models import CompanyInput, Job


SUMMARY_KEYS = {
    "companies_total",
    "companies_processed",
    "companies_write_succeeded",
    "companies_write_failed",
    "rows_written",
    "rows_failed",
    "stage_error_count",
}


def _build_job(company: str) -> Job:
    return Job(
        job_url=f"https://example.com/{company.lower()}-ae",
        company=company,
        job_title="Account Executive",
        department="Sales",
        job_description="Great sales role.",
        location="Austin, TX",
        salary="$150,000",
        is_remote="No",
        workplace_type="On-site",
        date_published="2026-05-01",
        date_updated="2026-05-01",
        ats="greenhouse",
    )


def _parse_summary(output: str) -> dict[str, int]:
    values: dict[str, int] = {}
    for line in output.splitlines():
        stripped = line.strip()
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        if key not in SUMMARY_KEYS:
            continue
        values[key] = int(value)
    return values


def _run_mode(monkeypatch, workers: int, fail_company: str | None):
    monkeypatch.setenv("JOBBE_WORKERS", str(workers))

    companies = [
        CompanyInput(name="Acme", keywords=["sales"], api_url="", record_id="Acme"),
        CompanyInput(name="Bravo", keywords=["sales"], api_url="", record_id="Bravo"),
        CompanyInput(name="Coda", keywords=["sales"], api_url="", record_id="Coda"),
    ]

    monkeypatch.setattr(runner.supabase_client, "read_scrape_list", lambda: companies)
    monkeypatch.setattr(runner.supabase_client, "start_run", lambda metadata, dry_run: None)
    monkeypatch.setattr(runner.supabase_client, "persist_run_artifacts", lambda **kwargs: [])

    def fake_process_company(
        company,
        cache_api_url,
        match_from_api_url,
        detect_ats,
        generate_slugs,
        scrape_ats_fn,
        filter_jobs_fn,
        enrich_fn,
    ):
        return CompanyResult(
            company_name=company.name,
            ats="greenhouse",
            jobs=[_build_job(company.name)],
            errors=[],
            unresolved=None,
            stats={"scraped": 1, "filtered": 1, "enriched": 1},
            pipeline_completed=True,
        )

    monkeypatch.setattr(runner, "process_company", fake_process_company)

    def fake_upsert_jobs(jobs, run_id):
        company_name = jobs[0].company if jobs else ""
        if fail_company and company_name == fail_company:
            raise RuntimeError("500 Server Error")

    monkeypatch.setattr(runner.supabase_client, "upsert_jobs", fake_upsert_jobs)
    monkeypatch.setattr(runner.supabase_client, "append_observations", lambda jobs, run_id: None)

    buffer = io.StringIO()
    with redirect_stdout(buffer):
        runner.run(dry_run=False)

    return _parse_summary(buffer.getvalue())


def test_runner_modes_consistent_on_normal_writes(monkeypatch):
    sequential = _run_mode(monkeypatch, workers=1, fail_company=None)
    concurrent = _run_mode(monkeypatch, workers=3, fail_company=None)

    assert sequential == concurrent
    assert sequential == {
        "companies_total": 3,
        "companies_processed": 3,
        "companies_write_succeeded": 3,
        "companies_write_failed": 0,
        "rows_written": 3,
        "rows_failed": 0,
        "stage_error_count": 0,
    }


def test_runner_modes_consistent_on_write_failure(monkeypatch):
    sequential = _run_mode(monkeypatch, workers=1, fail_company="Bravo")
    concurrent = _run_mode(monkeypatch, workers=3, fail_company="Bravo")

    assert sequential == concurrent
    assert sequential == {
        "companies_total": 3,
        "companies_processed": 3,
        "companies_write_succeeded": 2,
        "companies_write_failed": 1,
        "rows_written": 2,
        "rows_failed": 1,
        "stage_error_count": 1,
    }
