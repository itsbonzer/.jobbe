from fastapi import APIRouter, HTTPException

from ..supabase import SupabaseApiError
from .contracts import (
    JobDeleteRequest,
    JobDeleteResponse,
    JobPatchRequest,
    JobPatchResponse,
    JobsDistinctRequest,
    JobsDistinctResponse,
    JobsGridRequest,
    JobsGridResponse,
)
from .service import delete_job_rows, get_jobs_distinct, get_jobs_grid, update_job_row


router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.post("/grid", response_model=JobsGridResponse)
def read_jobs_grid(request: JobsGridRequest) -> JobsGridResponse:
    try:
        return get_jobs_grid(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/distinct", response_model=JobsDistinctResponse)
def read_jobs_distinct(request: JobsDistinctRequest) -> JobsDistinctResponse:
    try:
        return get_jobs_distinct(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.patch("/{job_url:path}", response_model=JobPatchResponse)
def patch_job_row(job_url: str, request: JobPatchRequest) -> JobPatchResponse:
    try:
        return update_job_row(job_url, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/delete", response_model=JobDeleteResponse)
def delete_jobs(request: JobDeleteRequest) -> JobDeleteResponse:
    try:
        return delete_job_rows(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
