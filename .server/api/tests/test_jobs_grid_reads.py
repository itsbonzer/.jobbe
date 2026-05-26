from pathlib import Path
import sys
from typing import Any

from fastapi.testclient import TestClient


SERVER_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER_DIR))

from api.jobs import service as jobs_service  # noqa: E402
from api.main import app  # noqa: E402


client = TestClient(app)


def test_jobs_grid_calls_supabase_rpc(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_call_rpc(function_name: str, body: dict[str, Any]) -> dict[str, Any]:
        calls.append({"function_name": function_name, "body": body})
        return {
            "rows": [
                {
                    "job_url": "https://example.com/jobs/1",
                    "company": "Acme",
                    "job_title": "Staff Engineer",
                }
            ],
            "last_row": 42,
        }

    monkeypatch.setattr(jobs_service, "call_rpc", fake_call_rpc)

    response = client.post(
        "/api/jobs/grid",
        json={
            "table": "jobs",
            "startRow": 0,
            "endRow": 5,
            "sortModel": [{"colId": "company", "sort": "asc"}],
            "filterModel": {"ats": {"filterType": "set", "values": ["lever"]}},
            "rowGroupCols": [{"id": "company", "field": "company"}],
            "groupKeys": [],
        },
    )

    assert response.status_code == 200
    assert response.json()["lastRow"] == 42
    assert calls == [
        {
            "function_name": "jobs_grid",
            "body": {
                "p_table": "jobs",
                "p_request": {
                    "startRow": 0,
                    "endRow": 5,
                    "sortModel": [{"colId": "company", "sort": "asc"}],
                    "filterModel": {
                        "ats": {"filterType": "set", "values": ["lever"]}
                    },
                    "rowGroupCols": [{"id": "company", "field": "company"}],
                    "groupKeys": [],
                },
            },
        }
    ]


def test_jobs_grid_rejects_unknown_query_column() -> None:
    response = client.post(
        "/api/jobs/grid",
        json={
            "table": "jobs",
            "startRow": 0,
            "endRow": 5,
            "sortModel": [{"colId": "not_a_column", "sort": "asc"}],
            "filterModel": {},
            "rowGroupCols": [],
            "groupKeys": [],
        },
    )

    assert response.status_code == 400
    assert response.json()["error"] == "Sort column is not supported: not_a_column"


def test_jobs_distinct_calls_supabase_rpc(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_call_rpc(function_name: str, body: dict[str, Any]) -> list[str | None]:
        calls.append({"function_name": function_name, "body": body})
        return ["Acme", None]

    monkeypatch.setattr(jobs_service, "call_rpc", fake_call_rpc)

    response = client.post(
        "/api/jobs/distinct",
        json={"table": "jobs", "column": "company"},
    )

    assert response.status_code == 200
    assert response.json() == {"values": ["Acme", None]}
    assert calls == [
        {
            "function_name": "jobs_distinct",
            "body": {"p_table": "jobs", "p_column": "company"},
        }
    ]


def test_jobs_distinct_rejects_unknown_column() -> None:
    response = client.post(
        "/api/jobs/distinct",
        json={"table": "jobs", "column": "not_a_column"},
    )

    assert response.status_code == 400
    assert response.json()["error"] == "Distinct column is not supported: not_a_column"
