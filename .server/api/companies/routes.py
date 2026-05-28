from fastapi import APIRouter, HTTPException

from ..supabase import SupabaseApiError
from .contracts import CompaniesDirectoryResponse, CompanyJobsResponse
from .service import list_companies, list_jobs_for_company


router = APIRouter(prefix="/api/companies", tags=["companies"])


@router.get("", response_model=CompaniesDirectoryResponse)
def read_companies() -> CompaniesDirectoryResponse:
    try:
        return list_companies()
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.get("/{company:path}/jobs", response_model=CompanyJobsResponse)
def read_company_jobs(company: str) -> CompanyJobsResponse:
    try:
        return list_jobs_for_company(company)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
