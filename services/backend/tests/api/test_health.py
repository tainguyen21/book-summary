from unittest.mock import AsyncMock

from bookwise.api.app import create_app
from bookwise.api.routes import health
from bookwise.api.routes.health import DependencyUnavailableError
from bookwise.config import Settings
from fastapi.testclient import TestClient


def make_settings() -> Settings:
    return Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        redis_url="redis://localhost:6379/15",
        s3_endpoint_url="http://localhost:9000",
        s3_bucket="test-books",
        s3_access_key_id="test",
        s3_secret_access_key="test",
        oidc_issuer="https://issuer.test",
        oidc_audience="bookwise-test",
    )


def test_liveness_is_process_only() -> None:
    response = TestClient(create_app(make_settings())).get("/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readiness_reports_component_statuses(monkeypatch) -> None:
    monkeypatch.setattr(health, "check_database", AsyncMock())
    monkeypatch.setattr(health, "check_redis", AsyncMock())
    monkeypatch.setattr(health, "check_storage", AsyncMock())

    response = TestClient(create_app(make_settings())).get("/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "components": {
            "database": "ok",
            "redis": "ok",
            "storage": "ok",
        },
    }


def test_readiness_returns_service_unavailable_for_failed_dependency(monkeypatch) -> None:
    monkeypatch.setattr(health, "check_database", AsyncMock())
    monkeypatch.setattr(
        health,
        "check_redis",
        AsyncMock(side_effect=DependencyUnavailableError),
    )
    monkeypatch.setattr(health, "check_storage", AsyncMock())

    response = TestClient(create_app(make_settings())).get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "components": {
            "database": "ok",
            "redis": "unavailable",
            "storage": "ok",
        },
    }
