import os
import sys
import argparse
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

# Avoid writing .pyc/__pycache__ during local runs.
sys.dont_write_bytecode = True

from company_worker import CompanyResult, process_company
from models import ATSMatch, CompanyInput, RunMetadata, UnresolvedCompany
import ats_detector, filter as job_filter, enricher, supabase_client
from scrapers import scrape_ats


DEFAULT_WORKERS = 10
MAX_WORKERS = 32


def _resolve_worker_count() -> int:
    raw = (os.getenv("JOBBE_WORKERS") or "").strip()
    if not raw:
        return DEFAULT_WORKERS

    try:
        parsed = int(raw)
    except ValueError:
        print(f"Warning: invalid JOBBE_WORKERS={raw!r}; using default {DEFAULT_WORKERS}")
        return DEFAULT_WORKERS

    if parsed < 1:
        print(f"Warning: JOBBE_WORKERS must be >= 1; using default {DEFAULT_WORKERS}")
        return DEFAULT_WORKERS

    if parsed > MAX_WORKERS:
        print(f"Warning: JOBBE_WORKERS capped at {MAX_WORKERS}")
        return MAX_WORKERS

    return parsed


def _cache_api_url(company: CompanyInput, match: ATSMatch, errors: list[dict]) -> None:
    """Persist confirmed API URL to scrape.api (when changed) and companies_api (always)."""
    if not company.record_id:
        return

    if not match.board_url:
        return

    if company.api_url != match.board_url:
        try:
            supabase_client.update_scrape_api_url(company.record_id, match.board_url)
            company.api_url = match.board_url
        except Exception as e:
            errors.append({
                "stage": "api_cache_update",
                "message": str(e),
                "company_name": company.name,
                "ats": match.ats,
                "fatal": False,
            })

    try:
        supabase_client.upsert_companies_api(company.name, match.board_url)
    except Exception as e:
        errors.append({
            "stage": "companies_api_upsert",
            "message": str(e),
            "company_name": company.name,
            "ats": match.ats,
            "fatal": False,
        })


def run(dry_run: bool = False) -> None:
    run_id = str(uuid.uuid4())[:8]
    started_at = datetime.now(timezone.utc).isoformat()
    worker_count = _resolve_worker_count()

    print(f"=== Jobbe run {run_id} {'(dry run)' if dry_run else ''} ===")
    print(f"=== Worker count: {worker_count} ===\n")

    # Stage 1: Read companies from Supabase
    print("--- Stage 1: Read companies ---")
    companies = supabase_client.read_scrape_list()
    print(f"  {len(companies)} companies loaded\n")

    # Open run record (status=RUNNING) before the pipeline loop.
    if not dry_run:
        try:
            supabase_client.start_run(
                RunMetadata(
                    run_id=run_id,
                    started_at=started_at,
                    finished_at="",
                    status="running",
                    total_companies=len(companies),
                ),
                dry_run=dry_run,
            )
        except Exception as e:
            print(f"  Warning: failed to record run start: {e}")

    all_jobs = []
    unresolved = []
    errors = []

    processed_companies = 0
    write_success_companies = 0
    write_failed_companies = 0
    rows_written = 0
    rows_failed = 0

    def handle_result(result: CompanyResult) -> None:
        nonlocal processed_companies, write_success_companies, write_failed_companies, rows_written, rows_failed

        processed_companies += 1
        print(f"--- Processing: {result.company_name} ---")
        if result.ats:
            print(f"  ATS: {result.ats}")

        if result.unresolved is not None:
            unresolved.append(result.unresolved)
            print(f"  Unresolved: {result.unresolved.reason}")

        if result.pipeline_completed:
            print(
                f"  Pipeline stats: scraped={result.stats.get('scraped', 0)}, "
                f"filtered={result.stats.get('filtered', 0)}, enriched={result.stats.get('enriched', 0)}"
            )

        if result.errors:
            errors.extend(result.errors)
            print(f"  Logged stage errors: {len(result.errors)}")

        all_jobs.extend(result.jobs)

        # Only attempt writes if company reached the write stage.
        if result.pipeline_completed:
            if dry_run:
                print("  [DRY RUN] Skipping Supabase writes for company")
            else:
                try:
                    supabase_client.upsert_jobs(result.jobs, run_id)
                    supabase_client.append_observations(result.jobs, run_id)
                    write_success_companies += 1
                    rows_written += len(result.jobs)
                except Exception as exc:
                    print(f"  Error writing {result.company_name} to Supabase: {exc}")
                    write_failed_companies += 1
                    rows_failed += len(result.jobs)
                    errors.append({
                        "stage": "supabase_write",
                        "message": str(exc),
                        "company_name": result.company_name,
                        "ats": result.ats,
                        "fatal": False,
                    })

        print()

    print("--- Stage 2-5: Detect, scrape, filter, enrich ---")
    if worker_count == 1:
        for company in companies:
            result = process_company(
                company=company,
                cache_api_url=_cache_api_url,
                match_from_api_url=ats_detector.match_from_api_url,
                detect_ats=ats_detector.detect_ats,
                generate_slugs=ats_detector.generate_slugs,
                scrape_ats_fn=scrape_ats,
                filter_jobs_fn=job_filter.filter_jobs,
                enrich_fn=enricher.enrich,
            )
            handle_result(result)
    else:
        with ThreadPoolExecutor(max_workers=worker_count) as executor:
            future_to_company = {
                executor.submit(
                    process_company,
                    company,
                    _cache_api_url,
                    ats_detector.match_from_api_url,
                    ats_detector.detect_ats,
                    ats_detector.generate_slugs,
                    scrape_ats,
                    job_filter.filter_jobs,
                    enricher.enrich,
                ): company
                for company in companies
            }

            for future in as_completed(future_to_company):
                company = future_to_company[future]
                try:
                    result = future.result()
                except Exception as exc:
                    processed_companies += 1
                    print(f"--- Processing: {company.name} ---")
                    print(f"  Worker failure: {exc}")
                    errors.append({
                        "stage": "worker",
                        "message": str(exc),
                        "company_name": company.name,
                        "ats": "",
                        "fatal": False,
                    })
                    print()
                    continue

                handle_result(result)

    print(f"=== Pipeline totals: {len(all_jobs)} jobs from {len(companies)} companies ===")
    if dry_run:
        print("--- Stage 6: Supabase write ---")
        print("  [DRY RUN] Skipping Supabase writes")
        for job in all_jobs:
            print(f"  {job.company} | {job.job_title} | {job.department} | {job.location} | {job.salary} | remote={job.is_remote}")
        print()

    # Record run metadata
    finished_at = datetime.now(timezone.utc).isoformat()
    metadata = RunMetadata(
        run_id=run_id,
        started_at=started_at,
        finished_at=finished_at,
        status="completed" if not any(e.get("fatal") for e in errors) else "failed",
        total_companies=len(companies),
        matched_companies=len(companies) - len(unresolved),
        jobs_seen=len(all_jobs),
        unresolved_count=len(unresolved),
        error_count=len(errors),
    )

    print("--- Run metadata ---")
    if dry_run:
        print(f"  [DRY RUN] {metadata}")
    else:
        warnings = supabase_client.persist_run_artifacts(
            metadata=metadata,
            unresolved=unresolved,
            errors=errors,
            run_id=run_id,
            dry_run=dry_run,
        )
        for warning in warnings:
            print(f"  Warning: {warning}")

    print("--- Run summary ---")
    execution_mode = "sequential" if worker_count == 1 else "concurrent"
    print(f"  execution_mode={execution_mode}")
    print("  write_coordinator=single_thread")
    print(f"  worker_count={worker_count}")
    print(f"  companies_total={len(companies)}")
    print(f"  companies_processed={processed_companies}")
    print(f"  companies_write_succeeded={write_success_companies}")
    print(f"  companies_write_failed={write_failed_companies}")
    print(f"  rows_written={rows_written}")
    print(f"  rows_failed={rows_failed}")
    print(f"  stage_error_count={len(errors)}")

    print(f"\n=== Done. {metadata.jobs_seen} jobs, {metadata.unresolved_count} unresolved, {metadata.error_count} errors ===")


def main():
    parser = argparse.ArgumentParser(description="Jobbe ATS Job Scraper")
    parser.add_argument("--dry-run", action="store_true",
                        help="Skip writes to Supabase, print results instead")
    args = parser.parse_args()
    run(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
