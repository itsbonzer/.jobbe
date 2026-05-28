from __future__ import annotations

from typing import Any
from urllib.parse import urlencode

from pydantic import ValidationError

from ..supabase import SupabaseApiError, SupabaseConfigError, select_rows
from .contracts import (
    CompaniesDirectoryResponse,
    CompanyDirectoryRow,
    CompanyJobsResponse,
    JobRow,
)


DIRECTORY_PAGE_SIZE = 1000


def list_companies() -> CompaniesDirectoryResponse:
    try:
        rows = _select_all_company_rows()
    except SupabaseConfigError:
        return CompaniesDirectoryResponse(companies=[])

    return CompaniesDirectoryResponse(
        companies=[_validate_company_directory_row(row) for row in rows]
    )


def list_jobs_for_company(company: str) -> CompanyJobsResponse:
    normalized_company = company.strip()
    if not normalized_company:
        raise ValueError("Company is required.")

    query = urlencode(
        {
            "select": "*",
            "company": f"eq.{normalized_company}",
            "order": "date_updated.desc.nullslast,date_published.desc.nullslast",
        },
        safe="*,",
    )

    try:
        rows = select_rows(f"jobs?{query}")
    except SupabaseConfigError:
        return CompanyJobsResponse(jobs=[])

    return CompanyJobsResponse(jobs=[_validate_job_row(row) for row in rows])


def _validate_company_directory_row(row: dict[str, Any]) -> CompanyDirectoryRow:
    try:
        return CompanyDirectoryRow(**row)
    except ValidationError as exc:
        raise SupabaseApiError(
            "Supabase returned an invalid companies directory row."
        ) from exc


def _select_all_company_rows() -> list[dict[str, Any]]:
    path = "companies_directory?select=*&order=company.asc"
    rows: list[dict[str, Any]] = []
    start = 0

    while True:
        page = select_rows(
            path,
            range_start=start,
            range_end=start + DIRECTORY_PAGE_SIZE - 1,
        )
        rows.extend(page)
        if len(page) < DIRECTORY_PAGE_SIZE:
            return rows
        start += DIRECTORY_PAGE_SIZE


def _validate_job_row(row: dict[str, Any]) -> JobRow:
    try:
        return JobRow(**row)
    except ValidationError as exc:
        raise SupabaseApiError("Supabase returned an invalid company job row.") from exc
