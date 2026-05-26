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


def test_run_continues_after_company_write_failure(monkeypatch):
    companies = [
        CompanyInput(
            name="Acme",
            keywords=["sales"],
            api_url="https://boards-api.greenhouse.io/v1/boards/acme/jobs",
            record_id="Acme",
        ),
        CompanyInput(
            name="Bravo",
            keywords=["sales"],
            api_url="https://boards-api.greenhouse.io/v1/boards/bravo/jobs",
            record_id="Bravo",
        ),
    ]

    upsert_attempts = []
    appended_companies = []
    recorded_errors = []
    finished_metadata = []

    monkeypatch.setattr(runner.supabase_client, "read_scrape_list", lambda: companies)
    monkeypatch.setattr(runner.supabase_client, "start_run", lambda metadata, dry_run: None)
    monkeypatch.setattr(runner.supabase_client, "record_unresolved", lambda unresolved, run_id: None)

    def fake_finish_run(metadata, dry_run):
        finished_metadata.append(metadata)

    def fake_record_errors(errors, run_id):
        recorded_errors.extend(errors)

    def fake_upsert_jobs(jobs, run_id):
        company_name = jobs[0].company if jobs else ""
        upsert_attempts.append(company_name)
        if company_name == "Acme":
            raise RuntimeError("500 Server Error")

    def fake_append_observations(jobs, run_id):
        company_name = jobs[0].company if jobs else ""
        appended_companies.append(company_name)

    monkeypatch.setattr(runner.supabase_client, "finish_run", fake_finish_run)
    monkeypatch.setattr(runner.supabase_client, "record_errors", fake_record_errors)
    monkeypatch.setattr(runner.supabase_client, "upsert_jobs", fake_upsert_jobs)
    monkeypatch.setattr(runner.supabase_client, "append_observations", fake_append_observations)

    monkeypatch.setattr(
        runner.ats_detector,
        "match_from_api_url",
        lambda company_name, api_url: ATSMatch(
            company_name=company_name,
            ats="greenhouse",
            slug=company_name.lower(),
            board_url=api_url,
        ),
    )
    monkeypatch.setattr(runner.ats_detector, "detect_ats", lambda company_name: None)
    monkeypatch.setattr(runner, "scrape_ats", lambda match: [_build_job(match.slug)])
    monkeypatch.setattr(runner.job_filter, "filter_jobs", lambda jobs, keywords: jobs)
    monkeypatch.setattr(runner.enricher, "enrich", lambda job: job)

    runner.run(dry_run=False)

    assert upsert_attempts == ["Acme", "Bravo"]
    assert appended_companies == ["Bravo"]

    write_errors = [e for e in recorded_errors if e.get("stage") == "supabase_write"]
    assert len(write_errors) == 1
    assert write_errors[0].get("company_name") == "Acme"
    assert write_errors[0].get("fatal") is False

    assert len(finished_metadata) == 1
    assert finished_metadata[0].status == "completed"
