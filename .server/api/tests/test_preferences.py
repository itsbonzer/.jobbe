from pathlib import Path
import sys
from typing import Any

from fastapi.testclient import TestClient


SERVER_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER_DIR))

from api.main import app  # noqa: E402
from api.preferences import service as preferences_service  # noqa: E402


client = TestClient(app)


def test_preference_read_returns_row(monkeypatch) -> None:
    def fake_read_preference(scope: str, key: str) -> dict[str, Any]:
        assert scope == "grid"
        assert key == "jobs:jobs"
        return {
            "scope": scope,
            "key": key,
            "value": {"version": 1, "state": {"filter": {}}},
            "updated_at": "2026-05-26T13:00:00Z",
        }

    monkeypatch.setattr(preferences_service, "read_preference", fake_read_preference)

    response = client.get("/api/preferences", params={"scope": "grid", "key": "jobs:jobs"})

    assert response.status_code == 200
    assert response.json()["preference"]["value"]["version"] == 1


def test_preference_read_returns_null_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(
        preferences_service,
        "read_preference",
        lambda scope, key: None,
    )

    response = client.get("/api/preferences", params={"scope": "grid", "key": "jobs:jobs"})

    assert response.status_code == 200
    assert response.json() == {"preference": None}


def test_preference_write_calls_upsert(monkeypatch) -> None:
    calls: list[dict[str, Any]] = []

    def fake_upsert_preference(scope: str, key: str, value: dict[str, Any]) -> None:
        calls.append({"scope": scope, "key": key, "value": value})

    monkeypatch.setattr(
        preferences_service,
        "upsert_preference",
        fake_upsert_preference,
    )

    response = client.put(
        "/api/preferences",
        json={
            "scope": "grid",
            "key": "jobs:jobs",
            "value": {"version": 1, "state": {"sort": {}}},
        },
    )

    assert response.status_code == 200
    assert response.json() == {"saved": True}
    assert calls == [
        {
            "scope": "grid",
            "key": "jobs:jobs",
            "value": {"version": 1, "state": {"sort": {}}},
        }
    ]


def test_preference_delete_calls_delete(monkeypatch) -> None:
    calls: list[dict[str, str]] = []

    def fake_delete_preference(scope: str, key: str) -> int:
        calls.append({"scope": scope, "key": key})
        return 1

    monkeypatch.setattr(
        preferences_service,
        "delete_preference",
        fake_delete_preference,
    )

    response = client.delete(
        "/api/preferences",
        params={"scope": "grid", "key": "jobs:jobs"},
    )

    assert response.status_code == 200
    assert response.json() == {"deleted": 1}
    assert calls == [{"scope": "grid", "key": "jobs:jobs"}]
