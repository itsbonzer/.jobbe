import html as html_module
import re
from datetime import datetime

from models import ATSMatch, Job

_TAG_RE = re.compile(r"<[^>]+>")

_US_STATES = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "hawaii": "HI", "idaho": "ID",
    "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD",
    "massachusetts": "MA", "michigan": "MI", "minnesota": "MN", "mississippi": "MS",
    "missouri": "MO", "montana": "MT", "nebraska": "NE", "nevada": "NV",
    "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC",
    "south dakota": "SD", "tennessee": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY", "district of columbia": "DC",
    "washington dc": "DC", "washington d.c.": "DC",
}
_US_STATE_ABBRS = set(_US_STATES.values())
_US_COUNTRY_NAMES = {
    "us", "u.s.", "usa", "u.s.a.", "united states", "united states of america",
}


def _normalize_lines(text: str) -> str:
    lines = []
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")

    for raw in normalized.split("\n"):
        line = re.sub(r"[ \t]+", " ", raw).strip()

        if not line:
            lines.append("")
            continue

        # Normalize bullets to a consistent marker.
        line = re.sub(r"^[\u2022\u00b7\u25cf]\s*", "- ", line)
        line = re.sub(r"^\*\s+", "- ", line)
        line = re.sub(r"^-\s*", "- ", line)

        # Keep numeric list semantics while normalizing delimiter style.
        line = re.sub(r"^(\d+)\)\s+", r"\1. ", line)

        # Promote heading-like plain text labels for readability.
        if re.match(r"^[A-Za-z][A-Za-z0-9 &/,+-]{1,80}:$", line):
            line = f"## {line[:-1].strip()}"
        elif line.isupper() and len(line) <= 60 and any(ch.isalpha() for ch in line):
            line = f"## {line.title()}"

        lines.append(line)

    collapsed = []
    for line in lines:
        if line == "":
            if collapsed and collapsed[-1] != "":
                collapsed.append("")
            continue
        collapsed.append(line)

    return "\n".join(collapsed).strip()


def _normalize_html(text: str) -> str:
    text = html_module.unescape(text)

    def _heading_repl(match: re.Match) -> str:
        level = int(match.group(1))
        inner = _TAG_RE.sub("", match.group(2))
        inner = html_module.unescape(inner)
        inner = re.sub(r"[ \t]+", " ", inner).strip()
        if not inner:
            return "\n"
        return f"\n\n{'#' * min(level, 6)} {inner}\n\n"

    text = re.sub(r"<h([1-6])[^>]*>(.*?)</h\1>", _heading_repl, text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "\n- ", text, flags=re.IGNORECASE)
    text = re.sub(r"</li>", "\n", text, flags=re.IGNORECASE)

    # Treat structural tags as block boundaries before stripping remaining tags.
    text = re.sub(
        r"</?(?:p|div|section|article|ul|ol|blockquote|pre|table|tr|td|th|header|footer|main|aside|nav)[^>]*>",
        "\n\n",
        text,
        flags=re.IGNORECASE,
    )

    text = _TAG_RE.sub("", text)
    text = html_module.unescape(text)

    return _normalize_lines(text)


def normalize_job_description(text: str, is_html: bool = False) -> str:
    """Normalize descriptions while preserving structural readability."""
    if not text:
        return ""

    source = html_module.unescape(text)
    looks_like_html = bool(re.search(r"<[a-zA-Z][^>]*>", source))

    if is_html or looks_like_html:
        return _normalize_html(source)

    return _normalize_lines(source)


def strip_html(text: str) -> str:
    """Backward-compatible alias for HTML description normalization."""
    return normalize_job_description(text, is_html=True)


def normalize_location(raw: str) -> str:
    """Normalize a free-form location string to "City, ST" for US locations.

    Drops the country segment when it identifies the US, abbreviates US state
    names to two letters, and strips trailing "(XX)" country-code suffixes.
    Non-US locations are returned cleaned (deduplicated whitespace, trimmed).
    Strings without recognizable city/state structure are returned as-is.
    """
    if not raw:
        return ""

    s = re.sub(r"\s*\(([A-Za-z]{2,3})\)\s*$", "", str(raw)).strip()
    if not s:
        return str(raw).strip()

    parts = [p.strip() for p in s.split(",") if p.strip()]
    if not parts:
        return s

    is_us = False
    if len(parts) >= 2 and parts[-1].lower() in _US_COUNTRY_NAMES:
        is_us = True
        parts = parts[:-1]

    if len(parts) < 2:
        return parts[0]

    city = parts[0]
    region = parts[1]
    region_lower = region.lower()

    if region_lower in _US_STATES:
        return f"{city}, {_US_STATES[region_lower]}"
    if len(region) == 2 and region.upper() in _US_STATE_ABBRS:
        return f"{city}, {region.upper()}"

    if is_us:
        return f"{city}, {region}"

    # Non-US: keep up to three segments (city, region, country) as-is.
    return ", ".join(parts[:3])


def normalize_date(raw: str) -> str:
    """Normalize a date/timestamp string to YYYY-MM-DD. Returns "" if empty."""
    if not raw:
        return ""

    s = str(raw).strip()
    if not s:
        return ""

    if re.match(r"^\d{4}-\d{2}-\d{2}$", s):
        return s

    # Anything before a "T" in an ISO timestamp is the date portion.
    if "T" in s:
        head = s.split("T", 1)[0]
        if re.match(r"^\d{4}-\d{2}-\d{2}$", head):
            return head

    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return s


def _post_process(job: Job) -> Job:
    job.location = normalize_location(job.location)
    job.date_published = normalize_date(job.date_published)
    job.date_updated = normalize_date(job.date_updated)
    if not job.date_updated:
        job.date_updated = job.date_published
    return job


def scrape_ats(match: ATSMatch) -> list[Job]:
    from scrapers import greenhouse, ashby, lever, workable

    providers = {
        "greenhouse": greenhouse,
        "ashby": ashby,
        "lever": lever,
        "workable": workable,
    }
    provider = providers.get(match.ats)
    if provider is None:
        raise ValueError(f"Unknown ATS provider: {match.ats!r}")
    return [_post_process(job) for job in provider.scrape(match.slug)]