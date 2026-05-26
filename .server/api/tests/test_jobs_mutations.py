from pathlib import Path
import sys
from typing import Any
from urllib.parse import quote

from fastapi.testclient import TestClient


SERVER_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER_DIR))

from api.jobs import service as jobs_service  # noqa: E402
from api.main import app  # noqa: E402


client = TestClient(app)


def test_patch_job_row_calls_supabase_patch(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []
    job_url = "https://example.com/jobs/123"

    def fake_patch_table_row(
        table_name: str,
        key_column: str,
        key_value: str,
        patch: dict[str, Any],
    ) -> None:
        calls.append(
            {
                "table_name": table_name,
                "key_column": key_column,
                "key_value": key_value,
                "patch": patch,
            }
        )

    monkeypatch.setattr(jobs_service, "patch_table_row", fake_patch_table_row)

    response = client.patch(
        f"/api/jobs/{quote(job_url, safe='')}",
        json={
            "table": "jobs",
            "patch": {
                "job_title": " Senior Product Manager ",
                "is_remote": "true",
                "date_updated": "2026-05-26",
            },
        },
    )

    assert response.status_code == 200
    assert response.json() == {"updated": 1}
    assert calls == [
        {
            "table_name": "jobs",
            "key_column": "job_url",
            "key_value": job_url,
            "patch": {
                "job_title": "Senior Product Manager",
                "is_remote": True,
                "date_updated": "2026-05-26",
            },
        }
    ]


def test_patch_job_row_rejects_primary_key_edit() -> None:
    response = client.patch(
        "/api/jobs/https%3A%2F%2Fexample.com%2Fjobs%2F123",
        json={
            "table": "jobs",
            "patch": {"job_url": "https://example.com/jobs/new"},
        },
    )

    assert response.status_code == 400
    assert response.json()["error"] == "job_url cannot be edited."


def test_patch_job_row_rejects_unsupported_field() -> None:
    response = client.patch(
        "/api/jobs/https%3A%2F%2Fexample.com%2Fjobs%2F123",
        json={
            "table": "jobs",
            "patch": {"days_since_updated": 2},
        },
    )

    assert response.status_code == 400
    assert response.json()["error"] == "Editable field is not supported: days_since_updated"


def test_delete_jobs_dedupes_and_calls_supabase_delete(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_delete_table_rows(
        table_name: str,
        key_column: str,
        key_values: list[str],
    ) -> int:
        calls.append(
            {
                "table_name": table_name,
                "key_column": key_column,
                "key_values": key_values,
            }
        )
        return len(key_values)

    monkeypatch.setattr(jobs_service, "delete_table_rows", fake_delete_table_rows)

    response = client.post(
        "/api/jobs/delete",
        json={
            "table": "jobs",
            "jobUrls": [
                " https://example.com/jobs/1 ",
                "https://example.com/jobs/1",
                "",
                "https://example.com/jobs/2",
            ],
        },
    )

    assert response.status_code == 200
    assert response.json() == {"deleted": 2}
    assert calls == [
        {
            "table_name": "jobs",
            "key_column": "job_url",
            "key_values": [
                "https://example.com/jobs/1",
                "https://example.com/jobs/2",
            ],
        }
    ]


def test_delete_jobs_allows_empty_selection_without_supabase_call(monkeypatch) -> None:
    calls: list[Any] = []
    monkeypatch.setattr(
        jobs_service,
        "delete_table_rows",
        lambda *args, **kwargs: calls.append((args, kwargs)),
    )

    response = client.post(
        "/api/jobs/delete",
        json={"table": "jobs", "jobUrls": ["", " "]},
    )

    assert response.status_code == 200
    assert response.json() == {"deleted": 0}
    assert calls == []
