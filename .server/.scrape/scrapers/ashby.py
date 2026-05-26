import requests

from models import Job
from scrapers import normalize_job_description

_ASHBY_JOB_BOARD_URL = "https://api.ashbyhq.com/posting-api/job-board/{slug}"


def _format_amount(value: float | int | None, currency_code: str | None) -> str:
    if value is None:
        return ""
    symbol = "$" if not currency_code or currency_code == "USD" else f"{currency_code} "
    return f"{symbol}{float(value):,.0f}"


def _extract_salary_from_components(components: list[dict]) -> str:
    salary_components = []
    for comp in components or []:
        if str(comp.get("compensationType", "")).lower() != "salary":
            continue
        salary_components.append(comp)

    if not salary_components:
        return ""

    mins = [c.get("minValue") for c in salary_components if c.get("minValue") is not None]
    maxs = [c.get("maxValue") for c in salary_components if c.get("maxValue") is not None]
    currency_code = next((c.get("currencyCode") for c in salary_components if c.get("currencyCode")), "USD")

    min_val = min(mins) if mins else None
    max_val = max(maxs) if maxs else None

    if min_val is None and max_val is None:
        return ""

    if min_val is not None and max_val is not None and min_val != max_val:
        return f"{_format_amount(min_val, currency_code)} - {_format_amount(max_val, currency_code)}"

    single = min_val if min_val is not None else max_val
    return _format_amount(single, currency_code)


def _extract_salary(item: dict) -> str:
    """Salary precedence: scrapeable summary -> numeric components -> tier summary."""
    compensation = item.get("compensation") or {}

    scrapeable_summary = str(compensation.get("scrapeableCompensationSalarySummary") or "").strip()
    if scrapeable_summary:
        return scrapeable_summary

    # First preference for numeric values is summaryComponents.
    salary = _extract_salary_from_components(compensation.get("summaryComponents") or [])
    if salary:
        return salary

    # Fall back to components nested in tiers when needed.
    for tier in compensation.get("compensationTiers") or []:
        salary = _extract_salary_from_components(tier.get("components") or [])
        if salary:
            return salary

    tier_summary = str(compensation.get("compensationTierSummary") or "").strip()
    if tier_summary:
        return tier_summary

    # Backward compatibility: older response shapes sometimes exposed this at root.
    return str(item.get("compensationTierSummary") or "").strip()


def _compose_location(locality: str = "", region: str = "", country: str = "") -> str:
    parts = [str(locality).strip(), str(region).strip(), str(country).strip()]
    return ", ".join(part for part in parts if part)


def _extract_location_from_address(address: dict | None) -> str:
    if not isinstance(address, dict):
        return ""
    postal = address.get("postalAddress") or {}
    if not isinstance(postal, dict):
        return ""

    return _compose_location(
        locality=postal.get("addressLocality", ""),
        region=postal.get("addressRegion", ""),
        country=postal.get("addressCountry", ""),
    )


def _extract_location(item: dict) -> str:
    """Ashby location priority:
    1) address.postalAddress.* (main structured location)
    2) location (display fallback)
    3) secondaryLocations[] (secondary fallback)
    """
    seen: set[str] = set()
    candidates: list[str] = []

    def add_candidate(value: str) -> None:
        v = str(value or "").strip()
        if not v:
            return
        key = v.lower()
        if key in seen:
            return
        seen.add(key)
        candidates.append(v)

    add_candidate(_extract_location_from_address(item.get("address")))
    add_candidate(item.get("location", ""))

    for secondary in item.get("secondaryLocations") or []:
        if not isinstance(secondary, dict):
            continue
        add_candidate(_extract_location_from_address(secondary.get("address")))
        add_candidate(secondary.get("locationName", ""))
        add_candidate(secondary.get("location", ""))

    return candidates[0] if candidates else ""


def scrape(slug: str) -> list[Job]:
    url = _ASHBY_JOB_BOARD_URL.format(slug=slug)
    resp = requests.get(url, params={"includeCompensation": "true"}, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for item in data.get("jobs", []):
        # Remote
        is_remote_raw = item.get("isRemote")
        if is_remote_raw is True:
            is_remote = "Yes"
        elif is_remote_raw is False:
            is_remote = "No"
        else:
            is_remote = ""

        workplace_type = item.get("workplaceType", "") or ""
        # Normalize: Ashby uses "Remote", "Hybrid", "On-Site" etc.
        wt_lower = workplace_type.lower()
        if "remote" in wt_lower:
            workplace_type = "Remote"
        elif "hybrid" in wt_lower:
            workplace_type = "Hybrid"
        elif "on-site" in wt_lower or "onsite" in wt_lower:
            workplace_type = "On-site"

        # Prefer descriptionPlain, fall back to descriptionHtml.
        plain = item.get("descriptionPlain", "") or ""
        html = item.get("descriptionHtml", "") or ""
        if plain.strip():
            description = normalize_job_description(plain, is_html=False)
        else:
            description = normalize_job_description(html, is_html=True)

        jobs.append(Job(
            job_url=item.get("jobUrl", ""),
            company=slug,
            job_title=item.get("title", ""),
            department=item.get("department", "") or "",
            job_description=description,
            location=_extract_location(item),
            salary=_extract_salary(item),
            is_remote=is_remote,
            workplace_type=workplace_type,
            date_published=item.get("publishedAt", "") or "",
            date_updated=item.get("updatedAt", "") or "",
            ats="ashby",
        ))

    return jobs
