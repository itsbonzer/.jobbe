import pathlib
import sys


JOBBE_DIR = pathlib.Path(__file__).resolve().parents[1]
if str(JOBBE_DIR) not in sys.path:
    sys.path.insert(0, str(JOBBE_DIR))

import runner
from models import ATSMatch, CompanyInput, Job


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


def test_run_summary_and_metadata_persistence_are_isolated(monkeypatch, capsys):
    companies = [
        CompanyInput(
            name="Acme",
            keywords=["sales"],
            api_url="https://boards-api.greenhouse.io/v1/boards/acme/jobs",
            record_id="Acme",
        ),
        CompanyInput(
            name="NoATS",
            keywords=["sales"],
            api_url="",
            record_id="NoATS",
        ),
    ]

    unresolved_calls = []
    error_calls = []

    monkeypatch.setattr(runner.supabase_client, "read_scrape_list", lambda: companies)
    monkeypatch.setattr(runner.supabase_client, "start_run", lambda metadata, dry_run: None)

    def fake_upsert_jobs(jobs, run_id):
        raise RuntimeError("500 Server Error")

    monkeypatch.setattr(runner.supabase_client, "upsert_jobs", fake_upsert_jobs)
    monkeypatch.setattr(runner.supabase_client, "append_observations", lambda jobs, run_id: None)

    monkeypatch.setattr(
        runner.ats_detector,
        "match_from_api_url",
        lambda company_name, api_url: (
            ATSMatch(
                company_name=company_name,
                ats="greenhouse",
                slug=company_name.lower(),
                board_url=api_url,
            )
            if api_url
            else None
        ),
    )
    monkeypatch.setattr(runner.ats_detector, "detect_ats", lambda company_name: None)
    monkeypatch.setattr(runner, "scrape_ats", lambda match: [_build_job(match.slug)])
    monkeypatch.setattr(runner.job_filter, "filter_jobs", lambda jobs, keywords: jobs)
    monkeypatch.setattr(runner.enricher, "enrich", lambda job: job)

    def fake_finish_run(metadata, dry_run):
        raise RuntimeError("finish failed")

    def fake_record_unresolved(unresolved, run_id):
        unresolved_calls.append((len(unresolved), run_id))

    def fake_record_errors(errors, run_id):
        error_calls.append((len(errors), run_id))

    monkeypatch.setattr(runner.supabase_client, "finish_run", fake_finish_run)
    monkeypatch.setattr(runner.supabase_client, "record_unresolved", fake_record_unresolved)
    monkeypatch.setattr(runner.supabase_client, "record_errors", fake_record_errors)

    runner.run(dry_run=False)

    assert len(unresolved_calls) == 1
    assert len(error_calls) == 1

    out = capsys.readouterr().out
    assert "companies_total=2" in out
    assert "companies_processed=2" in out
    assert "companies_write_succeeded=0" in out
    assert "companies_write_failed=1" in out
    assert "rows_written=0" in out
    assert "rows_failed=1" in out
    assert "stage_error_count=1" in out
    assert "Warning: finish_run failed: finish failed" in out
