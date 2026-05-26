import requests

from models import Job
from scrapers import normalize_job_description

_HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
}

_WORKABLE_LISTING_URL = "https://apply.workable.com/api/v3/accounts/{slug}/jobs"
_WORKABLE_DETAIL_URL = "https://apply.workable.com/api/v2/accounts/{slug}/jobs/{shortcode}"


def _fetch_listing(slug: str) -> list[dict]:
    """Fetch all job listings (paginated)."""
    all_results = []
    body = {}

    while True:
        resp = requests.post(
            _WORKABLE_LISTING_URL.format(slug=slug),
            json=body, timeout=30, headers=_HEADERS,
        )
        resp.raise_for_status()
        data = resp.json()

        results = data.get("results", [])
        all_results.extend(results)

        next_page = data.get("nextPage")
        if not next_page:
            break
        body = {"token": next_page}

    return all_results


def _fetch_detail(slug: str, shortcode: str) -> dict:
    """Fetch full job detail (includes description)."""
    resp = requests.get(
        _WORKABLE_DETAIL_URL.format(slug=slug, shortcode=shortcode),
        timeout=15, headers={"User-Agent": "Mozilla/5.0"},
    )
    resp.raise_for_status()
    return resp.json()


def _format_location_object(location_obj: dict | str | None) -> str:
    if isinstance(location_obj, str):
        return location_obj.strip()
    if not isinstance(location_obj, dict):
        return ""

    display = str(location_obj.get("display") or "").strip()
    if display:
        return display

    city = str(location_obj.get("city") or "").strip()
    region = str(location_obj.get("region") or "").strip()
    country = str(location_obj.get("country") or "").strip()
    country_code = str(location_obj.get("countryCode") or "").strip().upper()

    if not country and country_code:
        country = country_code

    parts = [city, region, country]
    normalized = ", ".join(part for part in parts if part)
    if normalized:
        return normalized

    return country_code


def _extract_locations_list(locations: list | None) -> str:
    if not isinstance(locations, list):
        return ""

    visible_candidates: list[str] = []
    hidden_candidates: list[str] = []

    for loc in locations:
        if not isinstance(loc, dict):
            continue
        text = _format_location_object(loc)
        if not text:
            continue
        if loc.get("hidden") is True:
            hidden_candidates.append(text)
        else:
            visible_candidates.append(text)

    if visible_candidates:
        return visible_candidates[0]
    if hidden_candidates:
        return hidden_candidates[0]
    return ""


def _extract_location(item: dict, detail: dict | None = None) -> str:
    """Workable location priority:
    1) listing.location
    2) listing.locations[]
    3) detail.location
    """
    location = _format_location_object(item.get("location"))
    if location:
        return location

    location = _extract_locations_list(item.get("locations"))
    if location:
        return location

    if detail:
        location = _format_location_object(detail.get("location"))
        if location:
            return location

    return ""


def scrape(slug: str) -> list[Job]:
    listings = _fetch_listing(slug)

    jobs = []
    for item in listings:
        shortcode = item.get("shortcode", "")

        detail: dict = {}
        description = ""
        if shortcode:
            try:
                detail = _fetch_detail(slug, shortcode)
                desc_parts = [
                    detail.get("description", ""),
                    detail.get("requirements", ""),
                    detail.get("benefits", ""),
                ]
                description = normalize_job_description("\n\n".join(p for p in desc_parts if p), is_html=True)
            except requests.RequestException as exc:
                print(f"  Warning: Workable detail fetch failed for {slug}/{shortcode}: {exc}")

        location = _extract_location(item, detail)

        # Remote / workplace
        remote_raw = item.get("remote")
        is_remote = "Yes" if remote_raw is True else ("No" if remote_raw is False else "")
        workplace_raw = (item.get("workplace") or detail.get("workplace") or "").lower()
        workplace_type = ""
        if "remote" in workplace_raw:
            workplace_type = "Remote"
            is_remote = "Yes"
        elif "hybrid" in workplace_raw:
            workplace_type = "Hybrid"
        elif "onsite" in workplace_raw or "on-site" in workplace_raw:
            workplace_type = "On-site"

        # Department: Workable returns a list
        dept_list = item.get("department") or []
        department = ", ".join(dept_list) if isinstance(dept_list, list) else str(dept_list)

        job_url = f"https://apply.workable.com/{slug}/j/{shortcode}/"

        jobs.append(Job(
            job_url=job_url,
            company=slug,
            job_title=item.get("title", ""),
            department=department,
            job_description=description,
            location=location,
            salary="",  # Workable doesn't expose salary in public endpoint
            is_remote=is_remote,
            workplace_type=workplace_type,
            date_published=item.get("published", "") or "",
            date_updated="",
            ats="workable",
        ))

    return jobs
