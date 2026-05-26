from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, field_validator


PreferenceScope = Literal["grid"]


class PreferenceRecord(BaseModel):
    scope: PreferenceScope
    key: str
    value: dict[str, Any]
    updated_at: str | None = None


class PreferenceReadResponse(BaseModel):
    preference: PreferenceRecord | None


class PreferenceWriteRequest(BaseModel):
    scope: PreferenceScope
    key: str
    value: dict[str, Any]

    @field_validator("key")
    @classmethod
    def key_must_not_be_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Preference key is required.")
        return normalized


class PreferenceWriteResponse(BaseModel):
    saved: bool


class PreferenceDeleteResponse(BaseModel):
    deleted: int
