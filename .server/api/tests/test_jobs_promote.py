from pathlib import Path
import sys
from typing import Any

from fastapi.testclient import TestClient


SERVER_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER_DIR))

from api.jobs import service as jobs_service  # noqa: E402
from api.main import app  # noqa: E402
from api.supabase import SupabaseApiError  # noqa: E402


client = TestClient(app)


def make_row(n: int) -> dict[str, Any]:
    return {
        "job_url": f"https://example.com/jobs/{n}",
        "company": "Acme",
        "job_title": "Engineer",
        "status": "Applied",
        "keywords": "should-be-dropped",
        "is_remote": True,
        "date_published": "2026-05-14",
    }


def test_promote_jobs_inserts_with_default_status(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_insert_table_rows(
        table_name: str,
        rows: list[dict[str, Any]],
        *,
        on_conflict: str,
        ignore_duplicates: bool = True,
    ) -> list[dict[str, Any]]:
        calls.append(
            {
                "table_name": table_name,
                "rows": rows,
                "on_conflict": on_conflict,
                "ignore_duplicates": ignore_duplicates,
            }
        )
        return rows

    monkeypatch.setattr(jobs_service, "insert_table_rows", fake_insert_table_rows)

    response = client.post(
        "/api/jobs/promote",
        json={"rows": [make_row(1), make_row(2)]},
    )

    assert response.status_code == 200
    assert response.json() == {"promoted": 2}

    assert len(calls) == 1
    call = calls[0]
    assert call["table_name"] == "apply"
    assert call["on_conflict"] == "job_url"

    for payload in call["rows"]:
        assert payload["status"] == "Keywords"
        assert "keywords" not in payload
        assert payload["job_url"].startswith("https://example.com/jobs/")
        assert payload["company"] == "Acme"
        assert payload["job_title"] == "Engineer"
        assert payload["is_remote"] is True
        assert payload["date_published"] == "2026-05-14"


def test_promote_counts_only_inserted_rows(monkeypatch) -> None:
    # Supabase skips rows already present (ignore-duplicates) and returns only the
    # rows actually inserted — promoted must reflect that, not the request size.
    def fake_insert_table_rows(
        table_name: str,
        rows: list[dict[str, Any]],
        *,
        on_conflict: str,
        ignore_duplicates: bool = True,
    ) -> list[dict[str, Any]]:
        return rows[:1]

    monkeypatch.setattr(jobs_service, "insert_table_rows", fake_insert_table_rows)

    response = client.post(
        "/api/jobs/promote",
        json={"rows": [make_row(1), make_row(2)]},
    )

    assert response.status_code == 200
    assert response.json() == {"promoted": 1}


def test_promote_dedupes_by_job_url(monkeypatch) -> None:
    calls: list[list[dict[str, Any]]] = []

    def fake_insert_table_rows(
        table_name: str,
        rows: list[dict[str, Any]],
        *,
        on_conflict: str,
        ignore_duplicates: bool = True,
    ) -> list[dict[str, Any]]:
        calls.append(rows)
        return rows

    monkeypatch.setattr(jobs_service, "insert_table_rows", fake_insert_table_rows)

    response = client.post(
        "/api/jobs/promote",
        json={"rows": [make_row(1), make_row(1)]},
    )

    assert response.status_code == 200
    assert response.json() == {"promoted": 1}
    assert len(calls) == 1
    assert len(calls[0]) == 1


def test_promote_empty_rows_skips_supabase(monkeypatch) -> None:
    calls: list[Any] = []
    monkeypatch.setattr(
        jobs_service,
        "insert_table_rows",
        lambda *args, **kwargs: calls.append((args, kwargs)) or [],
    )

    response = client.post("/api/jobs/promote", json={"rows": []})

    assert response.status_code == 200
    assert response.json() == {"promoted": 0}
    assert calls == []


def test_promote_surfaces_supabase_error(monkeypatch) -> None:
    def fake_insert_table_rows(*args: Any, **kwargs: Any) -> list[dict[str, Any]]:
        raise SupabaseApiError("Supabase is unavailable.")

    monkeypatch.setattr(jobs_service, "insert_table_rows", fake_insert_table_rows)

    response = client.post(
        "/api/jobs/promote",
        json={"rows": [make_row(1)]},
    )

    assert response.status_code == 502
    assert response.json()["error"] == "Supabase is unavailable."
