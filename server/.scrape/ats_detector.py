import re
from urllib.parse import urlparse

import requests

from models import ATSMatch


_SUFFIXES = re.compile(
    r",?\s*\b(inc\.?|corp\.?|llc|co\.?|ltd\.?|limited|incorporated|corporation)\s*$",
    re.IGNORECASE,
)

# Order: most common ATS first for faster detection
ATS_PROBES = [
    ("greenhouse", "https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"),
    ("lever", "https://api.lever.co/v0/postings/{slug}"),
    ("ashby", "https://api.ashbyhq.com/posting-api/job-board/{slug}"),
    # Workable uses POST — handled specially in _probe_url
    ("workable", "https://apply.workable.com/api/v3/accounts/{slug}/jobs"),
]


_GREENHOUSE_PATH = re.compile(r"^/v1/boards/(?P<slug>[^/]+)/jobs$")
_LEVER_PATH = re.compile(r"^/v0/postings/(?P<slug>[^/]+)$")
_ASHBY_PATH = re.compile(r"^/posting-api/job-board/(?P<slug>[^/]+)$")
_WORKABLE_PATH = re.compile(r"^/api/v3/accounts/(?P<slug>[^/]+)/jobs$")


def generate_slugs(company_name: str) -> list[str]:
    clean = _SUFFIXES.sub("", company_name).strip()
    clean = clean.replace("&", "and")
    clean = re.sub(r"['\u2019]s?\b", "", clean)  # possessives
    clean = re.sub(r"[^a-zA-Z0-9\s-]", "", clean).strip()

    words = clean.lower().split()
    if not words:
        return [company_name.lower().strip()]

    slugs = []
    hyphenated = "-".join(words)
    slugs.append(hyphenated)

    concatenated = "".join(words)
    if concatenated != hyphenated:
        slugs.append(concatenated)

    if len(words) > 1:
        slugs.append(words[0])

    # Deduplicate preserving order
    seen = set()
    return [s for s in slugs if not (s in seen or seen.add(s))]


def _probe_url(url: str, ats: str) -> bool:
    try:
        # Lever is slow — give it more time
        timeout = 20 if ats == "lever" else 10

        if ats == "workable":
            resp = requests.post(
                url, json={}, timeout=timeout,
                headers={"User-Agent": "Mozilla/5.0", "Content-Type": "application/json"},
            )
        else:
            resp = requests.get(url, timeout=timeout)

        if resp.status_code != 200:
            return False

        data = resp.json()

        # Validate response shape per provider
        if ats == "greenhouse":
            return isinstance(data, dict) and isinstance(data.get("jobs"), list)
        elif ats == "lever":
            return isinstance(data, list)
        elif ats == "ashby":
            return isinstance(data, dict) and isinstance(data.get("jobs"), list)
        elif ats == "workable":
            # Require at least 1 job to avoid false positives
            # (many slugs exist as empty Workable accounts)
            return isinstance(data, dict) and data.get("total", 0) > 0
        return False
    except (requests.RequestException, ValueError):
        return False


def match_from_api_url(company_name: str, api_url: str) -> ATSMatch | None:
    """Parse a cached API URL into an ATSMatch.

    Returns None for unknown or malformed URLs.
    """
    if not api_url or not isinstance(api_url, str):
        return None

    try:
        parsed = urlparse(api_url.strip())
    except ValueError:
        return None

    host = (parsed.netloc or "").lower()
    path = (parsed.path or "").rstrip("/")

    if host == "boards-api.greenhouse.io":
        m = _GREENHOUSE_PATH.match(path)
        if m:
            slug = m.group("slug")
            board_url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs"
            return ATSMatch(company_name=company_name, ats="greenhouse", slug=slug, board_url=board_url)

    if host in ("api.lever.co", "api.eu.lever.co"):
        m = _LEVER_PATH.match(path)
        if m:
            slug = m.group("slug")
            board_url = f"https://{host}/v0/postings/{slug}"
            return ATSMatch(company_name=company_name, ats="lever", slug=slug, board_url=board_url)

    if host == "api.ashbyhq.com":
        m = _ASHBY_PATH.match(path)
        if m:
            slug = m.group("slug")
            board_url = f"https://api.ashbyhq.com/posting-api/job-board/{slug}"
            return ATSMatch(company_name=company_name, ats="ashby", slug=slug, board_url=board_url)

    if host == "apply.workable.com":
        m = _WORKABLE_PATH.match(path)
        if m:
            slug = m.group("slug")
            board_url = f"https://apply.workable.com/api/v3/accounts/{slug}/jobs"
            return ATSMatch(company_name=company_name, ats="workable", slug=slug, board_url=board_url)

    return None


def detect_ats(company_name: str) -> ATSMatch | None:
    slugs = generate_slugs(company_name)
    for slug in slugs:
        for ats_name, url_template in ATS_PROBES:
            url = url_template.format(slug=slug)
            print(f"  Probing {ats_name}/{slug}...", end=" ")
            if _probe_url(url, ats_name):
                print("HIT")
                return ATSMatch(
                    company_name=company_name,
                    ats=ats_name,
                    slug=slug,
                    board_url=url,
                )
            print("miss")
    return None