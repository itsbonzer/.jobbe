from __future__ import annotations

from pydantic import BaseModel

from ..jobs.contracts import JobRow


class CompanyDirectoryRow(BaseModel):
    company: str
    workplace_type: str | None = None
    job_count: int
    latest_date_updated: str | None = None
    has_recent_alert: bool


class CompaniesDirectoryResponse(BaseModel):
    companies: list[CompanyDirectoryRow]


class CompanyJobsResponse(BaseModel):
    jobs: list[JobRow]
