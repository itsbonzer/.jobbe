from pathlib import Path
import sys

from fastapi.testclient import TestClient


SERVER_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER_DIR))

from api.main import app  # noqa: E402


client = TestClient(app)


def test_jobs_grid_returns_leaf_rows_with_contract_shape() -> None:
    response = client.post(
        "/api/jobs/grid",
        json={
            "table": "jobs",
            "startRow": 0,
            "endRow": 2,
            "sortModel": [{"colId": "company", "sort": "asc"}],
            "filterModel": {},
            "rowGroupCols": [],
            "groupKeys": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert set(payload) == {"rows", "lastRow"}
    assert payload["lastRow"] >= 4
    assert len(payload["rows"]) == 2
    assert {
        "job_url",
        "company",
        "job_title",
        "date_updated",
        "last_seen_at",
    }.issubset(payload["rows"][0])


def test_jobs_grid_returns_group_rows_for_group_request() -> None:
    response = client.post(
        "/api/jobs/grid",
        json={
            "table": "jobs",
            "startRow": 0,
            "endRow": 10,
            "sortModel": [],
            "filterModel": {},
            "rowGroupCols": [{"id": "company", "field": "company"}],
            "groupKeys": [],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["lastRow"] == 3
    assert payload["rows"][0]["__group"] is True
    assert "company" in payload["rows"][0]
    assert "child_count" in payload["rows"][0]


def test_jobs_grid_rejects_invalid_row_window() -> None:
    response = client.post(
        "/api/jobs/grid",
        json={
            "table": "jobs",
            "startRow": 20,
            "endRow": 10,
            "sortModel": [],
            "filterModel": {},
            "rowGroupCols": [],
            "groupKeys": [],
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]
