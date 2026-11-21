"""Every JSON route declares a response model, and those models match what the routes send.

The frontend's API types are generated from the OpenAPI document (#2031), so a route
without a model would reach the client as ``unknown``. The first test reads the
document (public FastAPI API only) and fails for any operation whose success response
has no schema.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from collections.abc import Callable
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from app import main
from app.core.config import settings
from app.main import app
from app.schemas import (
    HealthSummary,
    LivenessResponse,
    LongWeekendRead,
    McpCapabilities,
    PublicHolidayRead,
    ReadinessResponse,
    RequestMetricsSnapshot,
    SchoolHolidayRead,
    VapidPublicKeyResponse,
)
from tests.test_holidays import SAMPLE_PUBLIC_HOLIDAYS, SAMPLE_SCHOOL_HOLIDAYS

# Operations that legitimately have no JSON model, with the reason. A new entry needs a
# reason that is not "I did not write a model"; the tests below fail on stale entries.
NOT_JSON = {
    ("get", "/api/ical/{token}.ics"): "returns text/calendar",
    ("get", "/api/sync/events"): "Server-Sent Events stream",
}


def _success_responses(operation: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {code: body for code, body in operation["responses"].items() if code.startswith("2")}


def _is_unstructured(schema: dict[str, Any]) -> bool:
    """True for ``{}`` and for a bare object, which generate as ``unknown`` and ``Record<string, unknown>``."""
    if not schema:
        return True
    return schema.get("type") == "object" and not schema.get("properties") and "$ref" not in schema


def _operations() -> list[tuple[str, str, dict[str, Any]]]:
    paths = app.openapi()["paths"]
    return [(method, path, operation) for path, item in paths.items() for method, operation in item.items()]


def test_every_json_route_declares_a_response_model():
    unmodelled = []
    for method, path, operation in _operations():
        if (method, path) in NOT_JSON:
            continue
        for code, body in _success_responses(operation).items():
            if code == "204":
                continue
            content = body.get("content", {})
            json_schema = content.get("application/json", {}).get("schema")
            if content and "application/json" not in content:
                continue  # text/plain and friends
            if json_schema is None or _is_unstructured(json_schema):
                unmodelled.append(f"{method.upper()} {path} -> {code}")
    assert not unmodelled, (
        "These routes send JSON without a typed response_model, so the generated frontend type is "
        "`unknown`. Declare response_model=<Model> (the route may still return a JSONResponse):\n  "
        + "\n  ".join(unmodelled)
    )


# Response properties the wire really omits, so the generated type may keep them optional. Every other
# response field is always sent: a model with defaults must derive from ``ResponseModel`` (see
# ``app.schemas``), which marks them required in the document. A new entry needs a reason.
OPTIONAL_ON_THE_WIRE = {
    ("ReadinessResponse", "database"): "left out when no database is configured",
    ("McpToolCapability", "effect_detail"): "left out of read tools (response_model_exclude_unset)",
    ("PublicHolidayRead", "counties"): "upstream JSON is forwarded as is",
    ("PublicHolidayRead", "fixed"): "upstream JSON is forwarded as is",
    ("PublicHolidayRead", "launchYear"): "upstream JSON is forwarded as is",
    ("SchoolHolidayRead", "subdivisions"): "the upstream omits it for nationwide holidays",
    ("SchoolHolidaySubdivision", "shortName"): "upstream JSON is forwarded as is",
}


def _response_schema_names() -> set[str]:
    """Names of every component schema reachable from a response body."""
    document = app.openapi()
    schemas = document["components"]["schemas"]

    def refs(node: Any) -> set[str]:
        if isinstance(node, dict):
            found = {node["$ref"].rsplit("/", 1)[-1]} if "$ref" in node else set()
            for value in node.values():
                found |= refs(value)
            return found
        if isinstance(node, list):
            return set().union(*(refs(item) for item in node)) if node else set()
        return set()

    pending = set()
    for item in document["paths"].values():
        for operation in item.values():
            for code, response in operation["responses"].items():
                if code.startswith("2") or code == "503":
                    pending |= refs(response)
    reached: set[str] = set()
    while pending:
        name = pending.pop()
        if name not in reached:
            reached.add(name)
            pending |= refs(schemas[name])
    return reached


def test_response_fields_with_defaults_are_required_in_the_schema():
    schemas = app.openapi()["components"]["schemas"]
    optional = {
        (name, prop)
        for name in _response_schema_names()
        for prop in schemas[name].get("properties", {})
        if prop not in schemas[name].get("required", [])
    }
    unexpected = sorted(optional - OPTIONAL_ON_THE_WIRE.keys())
    assert not unexpected, (
        "These response fields are optional in the OpenAPI document, so the frontend type is `field?:` "
        "although the route always sends them. Derive the model from ResponseModel (app.schemas), or list "
        f"the field in OPTIONAL_ON_THE_WIRE with the reason the wire omits it:\n  {unexpected}"
    )
    stale = sorted(OPTIONAL_ON_THE_WIRE.keys() - optional)
    assert not stale, f"These are no longer optional; remove them from OPTIONAL_ON_THE_WIRE: {stale}"


def test_not_json_exemptions_are_still_needed():
    operations = {(method, path): operation for method, path, operation in _operations()}
    for key, reason in NOT_JSON.items():
        assert key in operations, f"{key} no longer exists; remove it from NOT_JSON ({reason})"
        for body in _success_responses(operations[key]).values():
            schema = body.get("content", {}).get("application/json", {}).get("schema")
            assert schema is None or _is_unstructured(schema), (
                f"{key} now has a response model; remove it from NOT_JSON ({reason})"
            )


# --- the models describe what the routes actually send -----------------------------------


@pytest.fixture
def client():
    return TestClient(app)


def test_health_responses_match_their_models(client):
    HealthSummary.model_validate(client.get("/api/health").json())
    LivenessResponse.model_validate(client.get("/api/health/liveness").json())


@pytest.mark.parametrize(
    "body",
    [
        {"status": "ok", "auth": "ok", "database": "ok"},
        {"status": "ok", "auth": "ok"},
        {"status": "degraded", "auth": "unreachable", "database": "unreachable"},
    ],
)
def test_readiness_model_accepts_the_shapes_the_route_builds(body):
    # The route assembles exactly these keys: ``database`` only when a database is configured.
    ReadinessResponse.model_validate(body)


def test_metrics_response_matches_its_model(client, monkeypatch):
    secret = "contract-secret"
    monkeypatch.setattr(settings, "METRICS_HMAC_SECRET", secret)
    ts = int(time.time())
    signature = hmac.new(secret.encode(), str(ts).encode(), hashlib.sha256).hexdigest()

    response = client.get("/api/metrics", headers={"X-Metrics-Token": f"{ts}:{signature}"})

    assert response.status_code == 200
    RequestMetricsSnapshot.model_validate(response.json())


def test_mcp_capabilities_keep_their_wire_shape_and_match_the_model(client, monkeypatch):
    disabled = client.get("/api/mcp/capabilities").json()
    McpCapabilities.model_validate(disabled)

    monkeypatch.setattr(main, "_mcp_app", object())
    monkeypatch.setattr(main, "_mcp", SimpleNamespace(version="test"))
    enabled = client.get("/api/mcp/capabilities").json()
    McpCapabilities.model_validate(enabled)

    # Read tools carry no ``effect_detail`` key at all (not null); the model must not add one.
    read_tools = [tool for tool in enabled["tools"] if tool["effect"] == "read"]
    write_tools = [tool for tool in enabled["tools"] if tool["effect"] == "write"]
    assert read_tools
    assert write_tools
    assert all("effect_detail" not in tool for tool in read_tools)
    assert all("effect_detail" in tool for tool in write_tools)


def test_vapid_model_serializes_the_camel_case_key():
    assert VapidPublicKeyResponse(publicKey=None).model_dump() == {"publicKey": None}


def test_holiday_models_accept_the_upstream_samples_the_proxies_forward():
    public = TypeAdapter(list[PublicHolidayRead]).validate_python(SAMPLE_PUBLIC_HOLIDAYS)
    # ``global`` is a Python keyword, so the model aliases it; the wire name must stay ``global``.
    assert public[0].model_dump(by_alias=True, mode="json")["global"] is True
    TypeAdapter(list[SchoolHolidayRead]).validate_python(SAMPLE_SCHOOL_HOLIDAYS)
    TypeAdapter(list[LongWeekendRead]).validate_python(
        [
            {
                "startDate": "2026-05-14",
                "endDate": "2026-05-17",
                "dayCount": 4,
                "needBridgeDay": True,
                "bridgeDays": ["2026-05-15"],
            }
        ]
    )


# --- fields with defaults are still sent: the schema change must not touch the wire ------------


def test_oidc_config_still_sends_a_null_end_session_url(monkeypatch):
    from app.routers import auth as auth_routes

    monkeypatch.setattr(
        auth_routes,
        "_discover",
        lambda issuer: _async_value(
            auth_routes.OidcDiscoveryConfig(issuer=issuer, authorization_url="https://a", token_url="https://t")
        ),
    )
    monkeypatch.setattr(auth_routes.settings, "OIDC_ISSUER_URL", "https://auth.example.test")
    monkeypatch.setattr(auth_routes, "_config_cache", {})

    body = TestClient(app).get("/api/auth/oidc-config").json()

    assert body == {
        "issuer": "https://auth.example.test",
        "authorization_url": "https://a",
        "token_url": "https://t",
        "end_session_url": None,
    }


async def _async_value(value):
    return value


def test_sync_push_results_still_send_every_field(
    db_client: TestClient,
    auth_headers: Callable[..., dict[str, str]],
    create_user_factory: Callable[..., int],
):
    from uuid import uuid4

    admin_headers = auth_headers(1, is_admin=True)
    headers = auth_headers(create_user_factory(db_client, admin_headers, "response-defaults-owner"))
    label_id = str(uuid4())

    response = db_client.post(
        "/api/sync/push",
        json={
            "labels": [
                {
                    "id": label_id,
                    "action": "create",
                    "client_updated_at": "2026-01-01T00:00:00Z",
                    "name": "Wire",
                    "color": "#AABBCC",
                }
            ]
        },
        headers=headers,
    )

    assert response.status_code == 200, response.text
    (result,) = response.json()["results"]["labels"]
    assert set(result) == {"id", "status", "server_updated_at", "conflict_reason", "code", "conflicting_task_id"}
    assert result["conflict_reason"] is None
