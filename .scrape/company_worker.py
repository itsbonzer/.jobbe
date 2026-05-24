from dataclasses import dataclass, field
from typing import Callable

from models import ATSMatch, CompanyInput, Job, UnresolvedCompany


@dataclass
class CompanyResult:
    company_name: str
    ats: str = ""
    jobs: list[Job] = field(default_factory=list)
    unresolved: UnresolvedCompany | None = None
    errors: list[dict] = field(default_factory=list)
    stats: dict[str, int] = field(default_factory=lambda: {
        "scraped": 0,
        "filtered": 0,
        "enriched": 0,
    })
    pipeline_completed: bool = False


def _make_unresolved(company_name: str, generate_slugs: Callable[[str], list[str]], reason: str) -> UnresolvedCompany:
    return UnresolvedCompany(
        company_name=company_name,
        slug_attempts=generate_slugs(company_name),
        ats_attempts=["greenhouse", "lever", "ashby", "workable"],
        reason=reason,
    )


def process_company(
    company: CompanyInput,
    cache_api_url: Callable[[CompanyInput, ATSMatch, list[dict]], None],
    match_from_api_url: Callable[[str, str], ATSMatch | None],
    detect_ats: Callable[[str], ATSMatch | None],
    generate_slugs: Callable[[str], list[str]],
    scrape_ats_fn: Callable[[ATSMatch], list[Job]],
    filter_jobs_fn: Callable[[list[Job], list[str]], list[Job]],
    enrich_fn: Callable[[Job], Job],
) -> CompanyResult:
    result = CompanyResult(company_name=company.name)

    match: ATSMatch | None = None
    used_cached_match = False

    if company.api_url:
        cached = match_from_api_url(company.name, company.api_url)
        if cached is not None:
            match = cached
            used_cached_match = True
            cache_api_url(company, match, result.errors)

    if match is None:
        try:
            match = detect_ats(company.name)
        except Exception as exc:
            result.errors.append({
                "stage": "detect",
                "message": str(exc),
                "company_name": company.name,
                "ats": "",
                "fatal": False,
            })
            return result

        if match is None:
            result.unresolved = _make_unresolved(company.name, generate_slugs, "no ATS board found")
            return result

        cache_api_url(company, match, result.errors)

    result.ats = match.ats

    try:
        raw_jobs = scrape_ats_fn(match)
    except Exception as exc:
        if used_cached_match:
            result.errors.append({
                "stage": "scrape_cached",
                "message": str(exc),
                "company_name": company.name,
                "ats": match.ats,
                "fatal": False,
            })

            try:
                redetected = detect_ats(company.name)
            except Exception as detect_exc:
                result.errors.append({
                    "stage": "detect",
                    "message": str(detect_exc),
                    "company_name": company.name,
                    "ats": "",
                    "fatal": False,
                })
                return result

            if redetected is None:
                result.unresolved = _make_unresolved(
                    company.name,
                    generate_slugs,
                    "cached API failed and ATS re-detect miss",
                )
                return result

            match = redetected
            result.ats = match.ats
            cache_api_url(company, match, result.errors)

            try:
                raw_jobs = scrape_ats_fn(match)
            except Exception as retry_exc:
                result.errors.append({
                    "stage": "scrape",
                    "message": str(retry_exc),
                    "company_name": company.name,
                    "ats": match.ats,
                    "fatal": False,
                })
                return result
        else:
            result.errors.append({
                "stage": "scrape",
                "message": str(exc),
                "company_name": company.name,
                "ats": match.ats,
                "fatal": False,
            })
            return result

    for job in raw_jobs:
        job.company = company.name

    filtered = filter_jobs_fn(raw_jobs, company.keywords)
    enriched = [enrich_fn(job) for job in filtered]

    result.jobs = enriched
    result.stats = {
        "scraped": len(raw_jobs),
        "filtered": len(filtered),
        "enriched": len(enriched),
    }
    result.pipeline_completed = True
    return result
