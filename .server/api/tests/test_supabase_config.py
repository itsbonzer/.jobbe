from pathlib import Path
import sys


SERVER_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(SERVER_DIR))

from api import supabase  # noqa: E402


def test_supabase_config_accepts_publishable_key(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.delenv("SUPABASE_SECRET_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    config = supabase.get_supabase_config()

    assert config is not None
    assert config.url == "https://example.supabase.co"
    assert config.key == "publishable-key"


def test_supabase_config_prefers_server_secret_key(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "secret-key")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "publishable-key")

    config = supabase.get_supabase_config()

    assert config is not None
    assert config.key == "secret-key"
