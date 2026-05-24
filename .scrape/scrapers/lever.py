import html as html_module
import re
from datetime import datetime, timezone

import requests

from models import Job
from scrapers import normalize_job_description

_LEVER_POSTINGS_URL = "https://api.lever.co/v0/postings/{slug}"


def _format_timestamp(ms: int | None) -> str:
    if not ms:
        return ""
    try:
        dt = datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
        return dt.isoformat()
    except (ValueError, OSError):
        return ""


def _format_salary_range(sr: dict | None) -> str:
    if not sr or not isinstance(sr, dict):
        return ""
    parts = []
    currency = sr.get("currency", "USD")
    sym = "$" if currency == "USD" else f"{currency} "
    min_val = sr.get("min")
    max_val = sr.get("max")
    if min_val is not None:
        parts.append(f"{sym}{min_val:,.0f}")
    if max_val is not None:
        parts.append(f"{sym}{max_val:,.0f}")
    interval = sr.get("interval", "")
    result = " - ".join(parts)
    if interval:
        result += f" {interval}"
    return result


def _location_mentions_country_code(location: str, country_code: str) -> bool:
    """Check country code as a token, not a substring (e.g. US != AUSTIN)."""
    if not country_code:
        return False
    pattern = re.compile(rf"(?<![A-Za-z]){re.escape(country_code)}(?![A-Za-z])", re.IGNORECASE)
    return bool(pattern.search(location))


def _extract_location(item: dict) -> str:
    """Lever location priority:
    1) categories.location
    2) categories.allLocations[0]
    3) country code

    If country code is present and not already reflected, append it for clarity.
    """
    categories = item.get("categories") or {}
    primary = str(categories.get("location") or "").strip()

    all_locations = categories.get("allLocations") or []
    backup = ""
    if isinstance(all_locations, list):
        for loc in all_locations:
            value = str(loc or "").strip()
            if value:
                backup = value
                break

    country_code = str(item.get("country") or "").strip().upper()

    location = primary or backup
    if location:
        if country_code and not _location_mentions_country_code(location, country_code):
            return f"{location} ({country_code})"
        return location

    return country_code


def _first_non_empty(*values) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def _normalize_list_content(content_html: str) -> str:
    content = str(content_html or "").strip()
    if not content:
        return ""

    content_lower = content.lower()
    has_list_item = "<li" in content_lower
    has_list_container = "<ul" in content_lower or "<ol" in content_lower
    if has_list_item and not has_list_container:
        return f"<ul>{content}</ul>"

    return content


def _extract_description(item: dict) -> str:
    """Build a full Lever description preserving rich structure.

    Priority:
    1) Rich HTML fields (description/opening/body) + lists + additional
    2) Plain fallbacks
    """
    content_obj = item.get("content") or {}
    if not isinstance(content_obj, dict):
        content_obj = {}

    description_html = _first_non_empty(
        item.get("description"),
        item.get("descriptionHtml"),
        content_obj.get("descriptionHtml"),
    )

    if not description_html:
        opening_html = _first_non_empty(
            item.get("opening"),
            content_obj.get("openingHtml"),
            content_obj.get("opening"),
        )
        body_html = _first_non_empty(
            item.get("descriptionBody"),
            content_obj.get("descriptionBodyHtml"),
        )
        description_html = "\n\n".join(part for part in [opening_html, body_html] if part)

    list_sections = []
    lists = item.get("lists") or content_obj.get("lists") or []
    if isinstance(lists, list):
        for section in lists:
            if not isinstance(section, dict):
                continue
            heading = str(section.get("text") or "").strip()
            content = _normalize_list_content(section.get("content") or "")
            if not heading and not content:
                continue

            section_parts = []
            if heading:
                section_parts.append(f"<h3>{html_module.escape(heading)}</h3>")
            if content:
                section_parts.append(content)
            list_sections.append("\n".join(section_parts))

    additional_html = _first_non_empty(
        item.get("additional"),
        item.get("closingPostingHtml"),
        content_obj.get("closingHtml"),
    )

    html_sections = [description_html, *list_sections, additional_html]
    combined_html = "\n\n".join(section.strip() for section in html_sections if str(section or "").strip())
    if combined_html:
        return normalize_job_description(combined_html, is_html=True)

    plain_description = _first_non_empty(
        item.get("descriptionPlain"),
        item.get("descriptionBodyPlain"),
        item.get("openingPlain"),
        item.get("additionalPlain"),
        content_obj.get("description"),
    )
    return normalize_job_description(plain_description, is_html=False)


def scrape(slug: str) -> list[Job]:
    url = _LEVER_POSTINGS_URL.format(slug=slug)
    resp = requests.get(url, params={"mode": "json"}, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    if not isinstance(data, list):
        return []

    jobs = []
    for item in data:
        categories = item.get("categories") or {}

        # Workplace type
        wt_raw = (item.get("workplaceType") or "").lower()
        workplace_type = ""
        is_remote = ""
        if "remote" in wt_raw:
            workplace_type = "Remote"
            is_remote = "Yes"
        elif "hybrid" in wt_raw:
            workplace_type = "Hybrid"
        elif "onsite" in wt_raw or "on-site" in wt_raw:
            workplace_type = "On-site"
            is_remote = "No"

        # Salary: try structured salaryRange, then scan additionalPlain
        salary = _format_salary_range(item.get("salaryRange"))
        if not salary:
            additional = item.get("additionalPlain", "") or ""
            # Look for salary line in additional text
            for line in additional.split("\n"):
                if "$" in line and any(w in line.lower() for w in ["range", "base", "salary", "compensation", "ote"]):
                    salary = line.strip()
                    break

        description = _extract_description(item)

        jobs.append(Job(
            job_url=item.get("hostedUrl", ""),
            company=slug,
            job_title=item.get("text", ""),
            department=categories.get("department", "") or "",
            job_description=description,
            location=_extract_location(item),
            salary=salary,
            is_remote=is_remote,
            workplace_type=workplace_type,
            date_published=_format_timestamp(item.get("createdAt")),
            date_updated="",
            ats="lever",
        ))

    return jobs
