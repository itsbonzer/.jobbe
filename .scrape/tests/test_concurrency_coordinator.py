import pathlib
import sys
import threading
import time


JOBBE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(JOBBE_DIR) not in sys.path:
    sys.path.insert(0, str(JOBBE_DIR))

import runner
from company_worker import CompanyResult
from models import CompanyInput, Job


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


def test_concurrency_workers_and_single_write_coordinator(monkeypatch):
    monkeypatch.setenv("JOBBE_WORKERS", "3")

    companies = [
        CompanyInput(name="Acme", keywords=["sales"], api_url="", record_id="Acme"),
        CompanyInput(name="Bravo", keywords=["sales"], api_url="", record_id="Bravo"),
        CompanyInput(name="Coda", keywords=["sales"], api_url="", record_id="Coda"),
        CompanyInput(name="Delta", keywords=["sales"], api_url="", record_id="Delta"),
    ]

    monkeypatch.setattr(runner.supabase_client, "read_scrape_list", lambda: companies)
    monkeypatch.setattr(runner.supabase_client, "start_run", lambda metadata, dry_run: None)
    monkeypatch.setattr(runner.supabase_client, "persist_run_artifacts", lambda **kwargs: [])

    thread_names = set()
    thread_lock = threading.Lock()

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
        with thread_lock:
            thread_names.add(threading.current_thread().name)
        time.sleep(0.03)
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

    write_lock = threading.Lock()
    active_writes = 0
    max_active_writes = 0
    upsert_companies = []

    def fake_upsert_jobs(jobs, run_id):
        nonlocal active_writes, max_active_writes
        with write_lock:
            active_writes += 1
            max_active_writes = max(max_active_writes, active_writes)
        time.sleep(0.02)
        upsert_companies.append(jobs[0].company if jobs else "")
        with write_lock:
            active_writes -= 1

    monkeypatch.setattr(runner.supabase_client, "upsert_jobs", fake_upsert_jobs)
    monkeypatch.setattr(runner.supabase_client, "append_observations", lambda jobs, run_id: None)

    runner.run(dry_run=False)

    assert len(thread_names) >= 2
    assert max_active_writes == 1
    assert sorted(upsert_companies) == sorted([c.name for c in companies])
