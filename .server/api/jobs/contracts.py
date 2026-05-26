from __future__ import annotations

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


JobsTableName = Literal["jobs", "apply"]
SortDirection = Literal["asc", "desc"]
MAX_GRID_WINDOW = 1000

JOBS_GRID_COLUMNS = frozenset(
    {
        "job_url",
        "company",
        "job_title",
        "job_description",
        "location",
        "salary",
        "is_remote",
        "workplace_type",
        "department",
        "date_published",
        "date_updated",
        "ats",
        "days_since_updated",
    }
)
APPLY_GRID_COLUMNS = JOBS_GRID_COLUMNS | frozenset({"status", "keywords"})
GRID_COLUMNS_BY_TABLE: dict[str, frozenset[str]] = {
    "jobs": JOBS_GRID_COLUMNS,
    "apply": APPLY_GRID_COLUMNS,
}
COMMON_EDITABLE_COLUMNS = frozenset(
    {
        "company",
        "job_title",
        "job_description",
        "location",
        "salary",
        "is_remote",
        "workplace_type",
        "department",
        "date_published",
        "date_updated",
        "ats",
        "is_listed",
        "education",
        "experience",
        "telecommuting",
    }
)
EDITABLE_COLUMNS_BY_TABLE: dict[str, frozenset[str]] = {
    "jobs": COMMON_EDITABLE_COLUMNS,
    "apply": COMMON_EDITABLE_COLUMNS | frozenset({"status", "keywords"}),
}
REQUIRED_TEXT_COLUMNS_BY_TABLE: dict[str, frozenset[str]] = {
    "jobs": frozenset({"company", "job_title", "ats"}),
    "apply": frozenset({"company", "job_title"}),
}
BOOLEAN_COLUMNS = frozenset({"is_listed", "is_remote", "telecommuting"})
DATE_COLUMNS = frozenset({"date_published", "date_updated"})


class GridSort(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    col_id: str = Field(alias="colId")
    sort: SortDirection

    @field_validator("col_id")
    @classmethod
    def col_id_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Sort column is required.")
        return normalized


class RowGroupColumn(BaseModel):
    id: str
    field: str

    @field_validator("id", "field")
    @classmethod
    def value_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Row group column values are required.")
        return normalized


class JobsGridRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    table: JobsTableName = "jobs"
    start_row: int = Field(default=0, alias="startRow", ge=0)
    end_row: int = Field(default=100, alias="endRow", ge=0)
    sort_model: list[GridSort] = Field(default_factory=list, alias="sortModel")
    filter_model: dict[str, Any] = Field(default_factory=dict, alias="filterModel")
    row_group_cols: list[RowGroupColumn] = Field(
        default_factory=list,
        alias="rowGroupCols",
    )
    group_keys: list[str] = Field(default_factory=list, alias="groupKeys")

    @model_validator(mode="after")
    def validate_window_and_groups(self) -> JobsGridRequest:
        if self.end_row < self.start_row:
            raise ValueError("endRow must be greater than or equal to startRow.")

        if len(self.group_keys) > len(self.row_group_cols):
            raise ValueError("groupKeys cannot be longer than rowGroupCols.")

        return self


class JobsDistinctRequest(BaseModel):
    table: JobsTableName = "jobs"
    column: str

    @field_validator("column")
    @classmethod
    def column_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Distinct column is required.")
        return normalized


class JobPatchRequest(BaseModel):
    table: JobsTableName = "jobs"
    patch: dict[str, Any]


class JobDeleteRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    table: JobsTableName = "jobs"
    job_urls: list[str] = Field(alias="jobUrls")


class JobRow(BaseModel):
    job_url: str
    company: str
    job_title: str
    location: str | None = None
    department: str | None = None
    job_description: str | None = None
    salary: str | None = None
    date_published: str | None = None
    date_updated: str | None = None
    ats: str | None = None
    is_listed: bool | None = None
    is_remote: bool | None = None
    workplace_type: str | None = None
    education: str | None = None
    experience: str | None = None
    telecommuting: bool | None = None
    first_seen_at: str | None = None
    last_seen_at: str | None = None
    last_seen_run_id: str | None = None
    status: str | None = None
    keywords: str | None = None


class JobsGridResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    rows: list[dict[str, Any]]
    last_row: int = Field(alias="lastRow", ge=0)


class JobsDistinctResponse(BaseModel):
    values: list[str | None]


class JobPatchResponse(BaseModel):
    updated: int


class JobDeleteResponse(BaseModel):
    deleted: int


def validate_jobs_grid_request(request: JobsGridRequest) -> None:
    if request.end_row - request.start_row > MAX_GRID_WINDOW:
        raise ValueError(f"Grid windows cannot exceed {MAX_GRID_WINDOW} rows.")

    allowed_columns = _columns_for_table(request.table)

    for sort in request.sort_model:
        _validate_column(sort.col_id, allowed_columns, "Sort")

    for filter_column in request.filter_model:
        _validate_column(filter_column, allowed_columns, "Filter")

    for row_group_col in request.row_group_cols:
        _validate_column(row_group_col.field, allowed_columns, "Group")


def validate_distinct_request(request: JobsDistinctRequest) -> None:
    _validate_column(request.column, _columns_for_table(request.table), "Distinct")


def normalize_job_url(job_url: str) -> str:
    normalized = job_url.strip()
    if not normalized:
        raise ValueError("Job URL is required.")
    return normalized


def normalize_job_patch_request(
    request: JobPatchRequest,
) -> dict[str, str | bool | None]:
    if not request.patch:
        raise ValueError("Patch must include at least one editable field.")

    editable_columns = EDITABLE_COLUMNS_BY_TABLE[request.table]
    normalized_patch: dict[str, str | bool | None] = {}

    for field, value in request.patch.items():
        if field == "job_url":
            raise ValueError("job_url cannot be edited.")

        if field not in editable_columns:
            raise ValueError(f"Editable field is not supported: {field}")

        normalized_patch[field] = _normalize_patch_value(
            table=request.table,
            field=field,
            value=value,
        )

    if not normalized_patch:
        raise ValueError("Patch must include at least one editable field.")

    return normalized_patch


def normalize_job_delete_request(request: JobDeleteRequest) -> list[str]:
    deduped: list[str] = []
    seen: set[str] = set()

    for value in request.job_urls:
        normalized = value.strip()
        if not normalized or normalized in seen:
            continue

        seen.add(normalized)
        deduped.append(normalized)

    return deduped


def _columns_for_table(table: JobsTableName) -> frozenset[str]:
    return GRID_COLUMNS_BY_TABLE[table]


def _validate_column(
    column: str,
    allowed_columns: frozenset[str],
    context: str,
) -> None:
    if column not in allowed_columns:
        raise ValueError(f"{context} column is not supported: {column}")


def _normalize_patch_value(
    table: JobsTableName,
    field: str,
    value: Any,
) -> str | bool | None:
    if field in BOOLEAN_COLUMNS:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"true", "1", "yes"}:
                return True
            if normalized in {"false", "0", "no"}:
                return False
        raise ValueError(f"{field} must be a boolean or null.")

    if field in DATE_COLUMNS:
        if value is None:
            return None
        if not isinstance(value, str):
            raise ValueError(f"{field} must be an ISO date string or null.")
        normalized = value.strip()
        if not normalized:
            return None
        try:
            date.fromisoformat(normalized)
        except ValueError as exc:
            raise ValueError(f"{field} must be an ISO date string.") from exc
        return normalized

    if value is None:
        if field in REQUIRED_TEXT_COLUMNS_BY_TABLE[table]:
            raise ValueError(f"{field} is required.")
        return None

    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string or null.")

    normalized = value.strip()
    if not normalized and field in REQUIRED_TEXT_COLUMNS_BY_TABLE[table]:
        raise ValueError(f"{field} is required.")

    return normalized if normalized else None
