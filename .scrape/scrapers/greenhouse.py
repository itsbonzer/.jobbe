import requests

from models import Job
from scrapers import normalize_job_description

_GREENHOUSE_BOARD_URL = "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"


def _extract_location(item: dict) -> str:
    """Greenhouse location priority:
    1) location.name
    2) offices[].location
    3) offices[].name
    """
    loc_obj = item.get("location") or {}
    primary = ""
    if isinstance(loc_obj, dict):
        primary = str(loc_obj.get("name") or "").strip()
    elif isinstance(loc_obj, str):
        primary = loc_obj.strip()
    if primary:
        return primary

    offices = item.get("offices") or []
    for office in offices:
        if not isinstance(office, dict):
            continue
        office_location = str(office.get("location") or "").strip()
        if office_location:
            return office_location

    for office in offices:
        if not isinstance(office, dict):
            continue
        office_name = str(office.get("name") or "").strip()
        if office_name:
            return office_name

    return ""


def scrape(slug: str) -> list[Job]:
    # content=true returns full description HTML in each posting.
    url = _GREENHOUSE_BOARD_URL.format(slug=slug)
    resp = requests.get(url, params={"content": "true"}, timeout=30)
    resp.raise_for_status()
    data = resp.json()

    jobs = []
    for item in data.get("jobs", []):
        # Department: first department name or ""
        departments = item.get("departments") or []
        department = departments[0]["name"] if departments else ""

        # Salary / remote from metadata (list of {name, value} dicts, can be None)
        salary = ""
        is_remote = ""
        workplace_type = ""
        for meta in item.get("metadata") or []:
            name = (meta.get("name") or "").lower()
            value = meta.get("value")
            if not value:
                continue
            if "salary" in name or "compensation" in name:
                salary = str(value)
            if "remote" in name:
                val_lower = str(value).lower()
                if val_lower in ("true", "yes"):
                    is_remote = "Yes"
                    workplace_type = "Remote"
                elif val_lower in ("false", "no"):
                    is_remote = "No"

        jobs.append(Job(
            job_url=item.get("absolute_url", ""),
            company=slug,
            job_title=item.get("title", ""),
            department=department,
            job_description=normalize_job_description(item.get("content", ""), is_html=True),
            location=_extract_location(item),
            salary=salary,
            is_remote=is_remote,
            workplace_type=workplace_type,
            date_published=item.get("first_published", ""),
            date_updated=item.get("updated_at", ""),
            ats="greenhouse",
        ))

    return jobs
