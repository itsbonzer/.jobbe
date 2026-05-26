from __future__ import annotations

from .contracts import (
    PreferenceDeleteResponse,
    PreferenceReadResponse,
    PreferenceRecord,
    PreferenceWriteRequest,
    PreferenceWriteResponse,
)
from ..supabase import delete_preference, read_preference, upsert_preference


def get_preference(scope: str, key: str) -> PreferenceReadResponse:
    row = read_preference(scope=scope, key=key)
    if row is None:
        return PreferenceReadResponse(preference=None)

    return PreferenceReadResponse(preference=PreferenceRecord(**row))


def save_preference(request: PreferenceWriteRequest) -> PreferenceWriteResponse:
    upsert_preference(
        scope=request.scope,
        key=request.key,
        value=request.value,
    )
    return PreferenceWriteResponse(saved=True)


def remove_preference(scope: str, key: str) -> PreferenceDeleteResponse:
    return PreferenceDeleteResponse(deleted=delete_preference(scope=scope, key=key))
