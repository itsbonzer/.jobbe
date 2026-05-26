from fastapi import APIRouter, HTTPException

from ..supabase import SupabaseApiError
from .contracts import (
    PreferenceDeleteResponse,
    PreferenceReadResponse,
    PreferenceWriteRequest,
    PreferenceWriteResponse,
)
from .service import get_preference, remove_preference, save_preference


router = APIRouter(prefix="/api/preferences", tags=["preferences"])


@router.get("", response_model=PreferenceReadResponse)
def read_preference_route(scope: str, key: str) -> PreferenceReadResponse:
    try:
        return get_preference(scope=scope, key=key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.put("", response_model=PreferenceWriteResponse)
def write_preference_route(
    request: PreferenceWriteRequest,
) -> PreferenceWriteResponse:
    try:
        return save_preference(request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.delete("", response_model=PreferenceDeleteResponse)
def delete_preference_route(scope: str, key: str) -> PreferenceDeleteResponse:
    try:
        return remove_preference(scope=scope, key=key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except SupabaseApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
