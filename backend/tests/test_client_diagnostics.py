"""Tests for privacy-bounded browser diagnostic reporting."""

from __future__ import annotations

import asyncio
import logging

import pytest
from fastapi.routing import APIRoute
from pydantic import ValidationError
from starlette.requests import Request

from app.routers.auth import AuthenticatedPrincipal, require_oidc_principal
from app.routers.client_diagnostics import ClientSyncDiagnostic, report_client_diagnostic, router


def _payload() -> dict:
    return {
        "event": "sync_failure",
        "attempt_id": "907a3698-2331-4d4d-8a8d-56193558168d",
        "app_version": "2026.8.9",
        "phase": "local_apply",
        "code": "duplicate_key_batch",
        "error_name": "DuplicateKeyInBatchError",
        "conflict_count": 2,
        "entity_counts": {"labels": 10, "tasks": 8},
        "request_ids": ["11111111-1111-4111-8111-111111111111"],
    }


def test_authenticated_oidc_client_can_report_diagnostic(caplog):
    request = Request({"type": "http", "state": {"request_id": "client-request-1"}})
    with caplog.at_level(logging.WARNING, logger="worktime.client_diagnostics"):
        response = asyncio.run(
            report_client_diagnostic(
                ClientSyncDiagnostic.model_validate(_payload()),
                request,
                AuthenticatedPrincipal(user_id=1),
            )
        )

    assert response.status_code == 204
    assert "attempt_id=907a3698-2331-4d4d-8a8d-56193558168d" in caplog.text
    assert "phase=local_apply" in caplog.text
    assert "conflict_count=2" in caplog.text
    assert "user=1" in caplog.text


def test_diagnostic_rejects_unbounded_or_record_shaped_fields():
    payload = _payload()
    payload["records"] = [{"text": "private task"}]

    with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
        ClientSyncDiagnostic.model_validate(payload)


def test_diagnostic_rejects_app_version_that_could_forge_log_lines():
    payload = _payload()
    payload["app_version"] = "2026.8.9\nWARNING forged log line"

    with pytest.raises(ValidationError, match="app_version"):
        ClientSyncDiagnostic.model_validate(payload)


def test_production_app_registers_client_diagnostics_route():
    from app.main import app

    assert "/api/client-diagnostics" in app.openapi()["paths"]


def test_endpoint_requires_interactive_oidc_dependency():
    route = next(
        route for route in router.routes if isinstance(route, APIRoute) and route.path == "/client-diagnostics"
    )
    assert any(dependency.call is require_oidc_principal for dependency in route.dependant.dependencies)
