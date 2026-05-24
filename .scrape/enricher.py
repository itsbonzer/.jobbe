import re
from dataclasses import replace

from models import Job


# --- Location patterns ---

_CITY_STATE = re.compile(
    r"\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b"
)
_LOCATION_LABEL = re.compile(
    r"(?:based in|located in|location[:\s]+)\s*([A-Za-z\s,]+?)(?:\.|;|\n|$)",
    re.IGNORECASE,
)


def _extract_location(job: Job) -> str:
    if job.location:
        return job.location

    found = set()

    # City, State patterns in description
    for match in _CITY_STATE.finditer(job.job_description):
        found.add(f"{match.group(1)}, {match.group(2)}")

    # Also check title
    for match in _CITY_STATE.finditer(job.job_title):
        found.add(f"{match.group(1)}, {match.group(2)}")

    # "Based in X" / "Located in X" / "Location: X"
    for match in _LOCATION_LABEL.finditer(job.job_description):
        loc = match.group(1).strip().rstrip(",")
        if loc and len(loc) > 2:
            found.add(loc)

    return ", ".join(sorted(found)) if found else ""


# --- Salary extraction ---

# Match dollar amounts with comma groups (e.g. $120,000, $1,200,000)
# and K notation. We then enforce six-figure minimum semantics.
_DOLLAR_AMOUNT = re.compile(r"\$\d{1,3}(?:,\d{3})+(?:\.\d{2})?")
_DOLLAR_K = re.compile(r"\$(\d{2,4}(?:\.\d+)?)\s*[kK]")


def _is_six_figure_amount(amount: str) -> bool:
    """Return True when a dollar amount text represents >= 100,000."""
    whole = amount.split(".", 1)[0]
    normalized = whole.replace("$", "").replace(",", "").strip()
    if not normalized.isdigit():
        return False
    return int(normalized) >= 100000


def _try_extract_dollar(text: str, start: int) -> tuple[str, int] | tuple[None, int]:
    """From a '$' at position start, try to extract a six-figure salary amount.

    Returns (amount_string, end_position) or (None, start).
    Accepts $xxx,xxx / $x,xxx,xxx and $xxxK+ notation.
    """
    m = _DOLLAR_AMOUNT.match(text, start)
    if m:
        amount = m.group(0)
        if _is_six_figure_amount(amount):
            return amount, m.end()

    m = _DOLLAR_K.match(text, start)
    if m:
        k_value = float(m.group(1))
        if k_value >= 100:
            return m.group(0), m.end()

    return None, start


def _extract_salary(job: Job) -> str:
    # Always try to extract a clean dollar amount even from an existing
    # salary field that may contain a full paragraph (e.g. Lever/Spotify).
    # Search salary field first (more targeted), then description.
    for text in (job.salary, job.job_description):
        result = _scan_for_salary(text)
        if result:
            return result
    return job.salary  # keep original if no clean extraction found


def _scan_for_salary(text: str) -> str:
    if not text:
        return ""
    i = 0
    while i < len(text):
        if text[i] == "$":
            amount, end = _try_extract_dollar(text, i)
            if amount:
                # Look ahead for a second $ within 15 chars (covers " - $", " to $", "—$")
                lookahead = text[end:end + 15]
                second_dollar = lookahead.find("$")
                if second_dollar >= 0:
                    amount2, _ = _try_extract_dollar(text, end + second_dollar)
                    if amount2:
                        return f"{amount} - {amount2}"
                return amount
        i += 1

    return ""


# --- Remote patterns ---

_REMOTE_TITLE = re.compile(
    r"(?:\(remote\)|\[remote\]|\bremote\b|- remote)",
    re.IGNORECASE,
)
_REMOTE_LOCATION = re.compile(
    r"\b(?:remote|anywhere|work from home)\b",
    re.IGNORECASE,
)
_REMOTE_DESC = re.compile(
    r"\b(?:remote(?:ly)?|work from home|WFH|work from anywhere|distributed team|fully distributed)\b",
    re.IGNORECASE,
)
_HYBRID_DESC = re.compile(
    r"\b(?:hybrid|flexible location)\b",
    re.IGNORECASE,
)
_ONSITE_DESC = re.compile(
    r"\b(?:on[- ]?site|in[- ]office|in office|onsite)\b",
    re.IGNORECASE,
)


def _extract_remote(job: Job) -> tuple[str, str]:
    is_remote = job.is_remote
    workplace_type = job.workplace_type

    # If both already populated, nothing to do
    if is_remote and workplace_type:
        return is_remote, workplace_type

    # Scan signals
    remote_signal = False
    hybrid_signal = False
    onsite_signal = False

    if _REMOTE_TITLE.search(job.job_title):
        remote_signal = True
    if _REMOTE_LOCATION.search(job.location):
        remote_signal = True
    if _REMOTE_DESC.search(job.job_description):
        remote_signal = True
    if _HYBRID_DESC.search(job.job_description):
        hybrid_signal = True
    if _ONSITE_DESC.search(job.job_description):
        onsite_signal = True

    # Determine is_remote
    if not is_remote:
        if remote_signal:
            is_remote = "Yes"
        elif onsite_signal and not remote_signal and not hybrid_signal:
            is_remote = "No"

    # Determine workplace_type
    if not workplace_type:
        if remote_signal and not hybrid_signal:
            workplace_type = "Remote"
        elif hybrid_signal:
            workplace_type = "Hybrid"
        elif onsite_signal:
            workplace_type = "On-site"

    return is_remote, workplace_type


# --- Main enricher ---


def enrich(job: Job) -> Job:
    """Return a new Job with empty fields filled via heuristics. Never overwrites."""
    location = _extract_location(job)
    salary = _extract_salary(job)
    is_remote, workplace_type = _extract_remote(job)

    return replace(
        job,
        location=location,
        salary=salary,
        is_remote=is_remote,
        workplace_type=workplace_type,
    )
