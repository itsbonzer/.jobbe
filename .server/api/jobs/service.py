from __future__ import annotations

from typing import Any

from ..supabase import (
    SupabaseApiError,
    SupabaseConfigError,
    call_rpc,
    delete_table_rows,
    patch_table_row,
)
from .contracts import (
    JobRow,
    JobDeleteRequest,
    JobDeleteResponse,
    JobPatchRequest,
    JobPatchResponse,
    JobsDistinctRequest,
    JobsDistinctResponse,
    JobsGridRequest,
    JobsGridResponse,
    normalize_job_delete_request,
    normalize_job_patch_request,
    normalize_job_url,
    validate_distinct_request,
    validate_jobs_grid_request,
)


_STUB_JOBS: tuple[JobRow, ...] = (
    JobRow(
        job_url="https://jobbe.local/jobs/atlas-solutions/product-ops-lead",
        company="Atlas Solutions",
        job_title="Product Operations Lead",
        location="Chicago, IL",
        department="Operations",
        job_description="Own intake, prioritization, and launch readiness for product work.",
        salary="$125,000 - $155,000",
        date_published="2026-05-14",
        date_updated="2026-05-21",
        ats="greenhouse",
        is_listed=True,
        is_remote=False,
        workplace_type="Hybrid",
        education=None,
        experience="Senior",
        telecommuting=False,
        first_seen_at="2026-05-20T14:30:00Z",
        last_seen_at="2026-05-25T20:45:00Z",
        last_seen_run_id="stub-run-001",
    ),
    JobRow(
        job_url="https://jobbe.local/jobs/northstar-ai/frontend-engineer",
        company="Northstar AI",
        job_title="Frontend Engineer",
        location="Remote - United States",
        department="Engineering",
        job_description="Build dense workflow UI for AI-assisted recruiting tools.",
        salary="$140,000 - $180,000",
        date_published="2026-05-10",
        date_updated="2026-05-22",
        ats="ashby",
        is_listed=True,
        is_remote=True,
        workplace_type="Remote",
        education=None,
        experience="Mid-Senior",
        telecommuting=True,
        first_seen_at="2026-05-18T10:00:00Z",
        last_seen_at="2026-05-25T20:45:00Z",
        last_seen_run_id="stub-run-001",
    ),
    JobRow(
        job_url="https://jobbe.local/jobs/northstar-ai/platform-engineer",
        company="Northstar AI",
        job_title="Platform Engineer",
        location="Remote - United States",
        department="Engineering",
        job_description="Maintain data services and server APIs for the jobs platform.",
        salary="$150,000 - $190,000",
        date_published="2026-05-08",
        date_updated="2026-05-18",
        ats="ashby",
        is_listed=True,
        is_remote=True,
        workplace_type="Remote",
        education=None,
        experience="Senior",
        telecommuting=True,
        first_seen_at="2026-05-18T10:00:00Z",
        last_seen_at="2026-05-25T20:45:00Z",
        last_seen_run_id="stub-run-001",
    ),
    JobRow(
        job_url="https://jobbe.local/jobs/waypoint-health/revenue-analyst",
        company="Waypoint Health",
        job_title="Revenue Analyst",
        location="Boston, MA",
        department="Finance",
        job_description="Analyze pipeline, renewals, and expansion signals for go-to-market teams.",
        salary="$95,000 - $120,000",
        date_published="2026-05-12",
        date_updated="2026-05-16",
        ats="lever",
        is_listed=True,
        is_remote=False,
        workplace_type="On-site",
        education=None,
        experience="Mid",
        telecommuting=False,
        first_seen_at="2026-05-19T12:15:00Z",
        last_seen_at="2026-05-25T20:45:00Z",
        last_seen_run_id="stub-run-001",
    ),
)


def get_jobs_grid(request: JobsGridRequest) -> JobsGridResponse:
    validate_jobs_grid_request(request)

    try:
        payload = call_rpc(
            "jobs_grid",
            {
                "p_table": request.table,
                "p_request": _grid_request_payload(request),
            },
        )
    except SupabaseConfigError:
        return _get_stub_jobs_grid(request)

    return _grid_response_from_rpc(payload)


def get_jobs_distinct(request: JobsDistinctRequest) -> JobsDistinctResponse:
    validate_distinct_request(request)

    try:
        payload = call_rpc(
            "jobs_distinct",
            {
                "p_table": request.table,
                "p_column": request.column,
            },
        )
    except SupabaseConfigError:
        return JobsDistinctResponse(values=_get_stub_distinct_values(request))

    return _distinct_response_from_rpc(payload)


def update_job_row(job_url: str, request: JobPatchRequest) -> JobPatchResponse:
    normalized_job_url = normalize_job_url(job_url)
    patch = normalize_job_patch_request(request)

    patch_table_row(
        table_name=request.table,
        key_column="job_url",
        key_value=normalized_job_url,
        patch=patch,
    )
    return JobPatchResponse(updated=1)


def delete_job_rows(request: JobDeleteRequest) -> JobDeleteResponse:
    job_urls = normalize_job_delete_request(request)
    if not job_urls:
        return JobDeleteResponse(deleted=0)

    deleted = delete_table_rows(
        table_name=request.table,
        key_column="job_url",
        key_values=job_urls,
    )
    return JobDeleteResponse(deleted=deleted)


def _grid_request_payload(request: JobsGridRequest) -> dict[str, Any]:
    payload = request.model_dump(by_alias=True, mode="json")
    payload.pop("table", None)
    return payload


def _grid_response_from_rpc(payload: Any) -> JobsGridResponse:
    if not isinstance(payload, dict):
        raise SupabaseApiError("Supabase returned an unexpected jobs grid payload.")

    rows = payload.get("rows")
    last_row = payload.get("last_row", payload.get("lastRow"))

    if not isinstance(rows, list):
        raise SupabaseApiError("Supabase jobs grid payload is missing rows.")

    if not isinstance(last_row, int):
        raise SupabaseApiError("Supabase jobs grid payload is missing lastRow.")

    return JobsGridResponse(rows=rows, last_row=last_row)


def _distinct_response_from_rpc(payload: Any) -> JobsDistinctResponse:
    values = payload.get("values") if isinstance(payload, dict) else payload

    if not isinstance(values, list):
        raise SupabaseApiError("Supabase returned an unexpected distinct payload.")

    return JobsDistinctResponse(
        values=[None if value is None else str(value) for value in values]
    )


def _get_stub_jobs_grid(request: JobsGridRequest) -> JobsGridResponse:
    rows = _apply_group_keys([_to_row(job) for job in _STUB_JOBS], request)

    if _is_group_level(request):
        group_rows = _build_group_rows(rows, request)
        return _page_response(group_rows, request)

    sorted_rows = _sort_rows(rows, request)
    return _page_response(sorted_rows, request)


def _get_stub_distinct_values(request: JobsDistinctRequest) -> list[str | None]:
    values = {
        None if value is None else str(value)
        for value in (getattr(job, request.column, None) for job in _STUB_JOBS)
    }
    return sorted(values, key=lambda value: "" if value is None else value.lower())


def _to_row(job: JobRow) -> dict[str, Any]:
    return job.model_dump(mode="json", exclude_none=False)


def _apply_group_keys(
    rows: list[dict[str, Any]],
    request: JobsGridRequest,
) -> list[dict[str, Any]]:
    filtered_rows = rows

    for index, group_key in enumerate(request.group_keys):
        field = request.row_group_cols[index].field
        filtered_rows = [
            row for row in filtered_rows if str(row.get(field) or "") == group_key
        ]

    return filtered_rows


def _is_group_level(request: JobsGridRequest) -> bool:
    return len(request.row_group_cols) > len(request.group_keys)


def _build_group_rows(
    rows: list[dict[str, Any]],
    request: JobsGridRequest,
) -> list[dict[str, Any]]:
    group_field = request.row_group_cols[len(request.group_keys)].field
    groups: dict[str, int] = {}

    for row in rows:
        key = str(row.get(group_field) or "")
        groups[key] = groups.get(key, 0) + 1

    return [
        {"__group": True, group_field: key, "child_count": count}
        for key, count in sorted(groups.items(), key=lambda item: item[0].lower())
    ]


def _sort_rows(
    rows: list[dict[str, Any]],
    request: JobsGridRequest,
) -> list[dict[str, Any]]:
    sorted_rows = list(rows)

    for sort in reversed(request.sort_model):
        reverse = sort.sort == "desc"
        sorted_rows.sort(
            key=lambda row: str(row.get(sort.col_id) or "").lower(),
            reverse=reverse,
        )

    return sorted_rows


def _page_response(
    rows: list[dict[str, Any]],
    request: JobsGridRequest,
) -> JobsGridResponse:
    paged_rows = rows[request.start_row : request.end_row]
    return JobsGridResponse(rows=paged_rows, last_row=len(rows))
