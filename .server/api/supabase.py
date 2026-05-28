from __future__ import annotations

import json
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlencode
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


RPC_TIMEOUT_SECONDS = 30


class SupabaseApiError(RuntimeError):
    pass


class SupabaseConfigError(SupabaseApiError):
    pass


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    key: str

    @property
    def rest_url(self) -> str:
        return f"{self.url}/rest/v1"


def get_supabase_config() -> SupabaseConfig | None:
    local_env = _read_local_env()
    url = (
        _read_config_value("SUPABASE_URL", local_env)
        or _read_config_value("VITE_SUPABASE_URL", local_env)
    ).rstrip("/")
    key = (
        _read_config_value("SUPABASE_SERVICE_ROLE_KEY", local_env)
        or _read_config_value("SUPABASE_SECRET_KEY", local_env)
        or _read_config_value("SUPABASE_PUBLISHABLE_KEY", local_env)
        or _read_config_value("SUPABASE_ANON_KEY", local_env)
        or _read_config_value("VITE_SUPABASE_ANON_KEY", local_env)
    )

    if not url or not key:
        return None

    return SupabaseConfig(url=url, key=key)


def get_required_supabase_config() -> SupabaseConfig:
    config = get_supabase_config()
    if config is None:
        raise SupabaseConfigError(
            "Supabase credentials are not configured for the Jobs API."
        )
    return config


def call_rpc(function_name: str, body: dict[str, Any]) -> Any:
    config = get_required_supabase_config()
    return _send_json_request(
        config=config,
        method="POST",
        path=f"/rpc/{function_name}",
        body=body,
    )


def select_rows(
    path: str,
    *,
    range_start: int | None = None,
    range_end: int | None = None,
) -> list[dict[str, Any]]:
    config = get_required_supabase_config()
    normalized_path = path if path.startswith("/") else f"/{path}"
    extra_headers = None
    if range_start is not None or range_end is not None:
        if range_start is None or range_end is None:
            raise ValueError("Both range_start and range_end are required.")
        extra_headers = {
            "Range": f"{range_start}-{range_end}",
            "Range-Unit": "items",
        }

    payload = _send_json_request(
        config=config,
        method="GET",
        path=normalized_path,
        body=None,
        extra_headers=extra_headers,
    )

    if not isinstance(payload, list):
        raise SupabaseApiError("Supabase returned an unexpected select payload.")

    rows: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            raise SupabaseApiError("Supabase returned an invalid select row.")
        rows.append(row)

    return rows


def patch_table_row(
    table_name: str,
    key_column: str,
    key_value: str,
    patch: dict[str, Any],
) -> None:
    config = get_required_supabase_config()
    query = urlencode({key_column: f"eq.{key_value}"})
    _send_json_request(
        config=config,
        method="PATCH",
        path=f"/{table_name}?{query}",
        body=patch,
        extra_headers={"Prefer": "return=minimal"},
    )


def delete_table_rows(
    table_name: str,
    key_column: str,
    key_values: list[str],
) -> int:
    config = get_required_supabase_config()

    for key_value in key_values:
        query = urlencode({key_column: f"eq.{key_value}"})
        _send_json_request(
            config=config,
            method="DELETE",
            path=f"/{table_name}?{query}",
            body=None,
            extra_headers={"Prefer": "return=minimal"},
        )

    return len(key_values)


def read_preference(scope: str, key: str) -> dict[str, Any] | None:
    query = urlencode(
        {
            "select": "scope,key,value,updated_at",
            "scope": f"eq.{scope}",
            "key": f"eq.{key}",
            "limit": "1",
        }
    )
    payload = _send_json_request(
        config=get_required_supabase_config(),
        method="GET",
        path=f"/app_preferences?{query}",
        body=None,
    )
    if not isinstance(payload, list):
        raise SupabaseApiError("Supabase returned an unexpected preference payload.")
    if not payload:
        return None
    if not isinstance(payload[0], dict):
        raise SupabaseApiError("Supabase returned an invalid preference row.")
    return payload[0]


def upsert_preference(scope: str, key: str, value: dict[str, Any]) -> None:
    query = urlencode({"on_conflict": "scope,key"})
    _send_json_request(
        config=get_required_supabase_config(),
        method="POST",
        path=f"/app_preferences?{query}",
        body={
            "scope": scope,
            "key": key,
            "value": value,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        extra_headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
    )


def delete_preference(scope: str, key: str) -> int:
    query = urlencode({"scope": f"eq.{scope}", "key": f"eq.{key}"})
    _send_json_request(
        config=get_required_supabase_config(),
        method="DELETE",
        path=f"/app_preferences?{query}",
        body=None,
        extra_headers={"Prefer": "return=minimal"},
    )
    return 1


def _send_json_request(
    config: SupabaseConfig,
    method: str,
    path: str,
    body: dict[str, Any] | None,
    extra_headers: dict[str, str] | None = None,
) -> Any:
    request_body = None if body is None else json.dumps(body).encode("utf-8")
    headers = {
        "apikey": config.key,
        "Authorization": f"Bearer {config.key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)

    request = Request(
        f"{config.rest_url}{path}",
        data=request_body,
        method=method,
        headers=headers,
    )

    try:
        with urlopen(request, timeout=RPC_TIMEOUT_SECONDS) as response:
            response_body = response.read().decode("utf-8")
    except HTTPError as exc:
        raise SupabaseApiError(_read_http_error(exc)) from exc
    except URLError as exc:
        raise SupabaseApiError(f"Unable to reach Supabase. {exc.reason}") from exc

    if not response_body:
        return None

    try:
        return json.loads(response_body)
    except json.JSONDecodeError as exc:
        raise SupabaseApiError("Supabase returned invalid JSON.") from exc


def _read_config_value(name: str, local_env: dict[str, str]) -> str:
    return (os.getenv(name) or local_env.get(name) or "").strip()


def _read_local_env() -> dict[str, str]:
    if os.getenv("PYTEST_CURRENT_TEST") and not os.getenv(
        "JOBBE_API_USE_LOCAL_ENV_IN_TESTS"
    ):
        return {}

    env_path = Path(__file__).resolve().parent / ".env.local"
    if not env_path.exists():
        return {}

    values: dict[str, str] = {}
    try:
        lines = env_path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return values

    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue

        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value

    return values


def _read_http_error(exc: HTTPError) -> str:
    try:
        raw_body = exc.read().decode("utf-8")
    except Exception:
        raw_body = ""

    message = _read_error_message(raw_body)
    if message:
        return f"Supabase RPC failed ({exc.code}): {message}"

    return f"Supabase RPC failed with HTTP {exc.code}."


def _read_error_message(raw_body: str) -> str:
    if not raw_body:
        return ""

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        return raw_body.strip()

    if isinstance(payload, dict):
        for key in ("message", "error", "details", "hint"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()

    return raw_body.strip()
