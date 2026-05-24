import re

from models import Job

DEPARTMENT_KEYWORDS = ("sales", "gtm", "growth")

# US state abbreviations and names.
_US_STATES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
    "DC",
}

_US_STATE_NAMES = {
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut",
    "delaware", "florida", "georgia", "hawaii", "idaho", "illinois", "indiana", "iowa",
    "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan",
    "minnesota", "mississippi", "missouri", "montana", "nebraska", "nevada",
    "new hampshire", "new jersey", "new mexico", "new york", "north carolina", "north dakota",
    "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
    "south dakota", "tennessee", "texas", "utah", "vermont", "virginia", "washington",
    "west virginia", "wisconsin", "wyoming", "district of columbia",
}

_US_COUNTRY_TERMS = (
    "united states",
    "united states of america",
    "usa",
    "u.s.",
    "u.s.a",
    "north america",
)

REMOTE_US_VARIANTS = (
    "remote us",
    "remote, us",
    "remote - us",
    "remote (us)",
    "us remote",
    "us, remote",
    "us - remote",
    "(us) remote",
    "remote united states",
    "remote, united states",
    "remote - united states",
    "remote (united states)",
    "remote, (united states)",
    "remote - (united states)",
    "remote usa",
    "remote, usa",
    "remote - usa",
    "remote (usa)",
    "usa remote",
    "usa, remote",
    "usa - remote",
    "(usa) remote",
    "u.s. remote",
    "remote u.s."
)


_STATE_CODE_PATTERN = re.compile(r",\s*([A-Z]{2})\b")
_STATE_NAME_PATTERN = re.compile(
    r"\b(" + "|".join(sorted(re.escape(name) for name in _US_STATE_NAMES)) + r")\b",
    re.IGNORECASE,
)
_US_CODE_TOKEN = re.compile(r"(?<![A-Za-z])U\.?S\.?A?(?![A-Za-z])", re.IGNORECASE)


def _is_us_location(location: str) -> bool:
    """Check if a location string indicates United States."""
    if not location:
        return True  # unknown location; keep conservatively

    loc_text = str(location)
    loc_lower = loc_text.lower()

    # Explicit US indicators.
    if any(term in loc_lower for term in _US_COUNTRY_TERMS):
        return True

    # US / U.S. / USA token indicators.
    if _US_CODE_TOKEN.search(loc_text):
        return True

    if any(remote_variant in loc_lower for remote_variant in REMOTE_US_VARIANTS):
        return True

    # US state abbreviation pattern: "City, XX".
    for match in _STATE_CODE_PATTERN.finditer(loc_text):
        if match.group(1) in _US_STATES:
            return True

    # Full US state names (e.g. "San Francisco, California").
    if _STATE_NAME_PATTERN.search(loc_text):
        return True

    return False


def filter_jobs(jobs: list[Job], keywords: list[str]) -> list[Job]:
    """Keep jobs matching (department OR title keywords) AND US location."""
    kw_lower = [k.lower() for k in keywords if k.strip()]
    result = []
    for job in jobs:
        # Step 1: department or keyword match
        dept = job.department.lower()
        title = job.job_title.lower()
        role_match = (
            any(dk in dept for dk in DEPARTMENT_KEYWORDS)
            or any(kw in title for kw in kw_lower)
        )
        if not role_match:
            continue

        # Step 2: US location filter
        if not _is_us_location(job.location):
            continue

        result.append(job)
    return result
