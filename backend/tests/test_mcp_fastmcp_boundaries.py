"""Application-level guards for FastMCP upgrades (tool-body errors, MultiAuth, stateless HTTP, discovery)."""

from __future__ import annotations

import logging
from typing import Any
from unittest.mock import patch

import httpx2
import pytest
from fastmcp import Client
from fastmcp.client.transports import StreamableHttpTransport
from fastmcp.exceptions import ToolError
from fastmcp.server.auth import JWTVerifier, RemoteAuthProvider
from fastmcp.server.auth.providers.jwt import RSAKeyPair
from pydantic import AnyHttpUrl, BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.database.models import AuditEntry
from app.mcp_server import WorktimeMcpBackend, create_mcp_http_app, create_mcp_server
from app.schemas import UserCreate
from app.services import db_service, integration_client_service
from tests.test_mcp_server import _make_factory, _token_for_user

PRIVATE = "PRIVATE-NOTE-9f3a"
ISSUER = "https://auth.example/realms/worktime"
KEYS = RSAKeyPair.generate()


async def _owner(factory: async_sessionmaker[AsyncSession], username: str = "boundary-owner") -> int:
    async with factory() as session:
        user = await db_service.create_user(session, UserCreate(username=username, display_name="Owner"))
    return user.id


async def _audit_count(factory: async_sessionmaker[AsyncSession]) -> int:
    async with factory() as session:
        return await session.scalar(select(func.count()).select_from(AuditEntry)) or 0


async def _call(mcp, user_id: int, name: str, arguments: dict, *, through_proxy: bool) -> ToolError:
    with patch("app.mcp_server.get_access_token", return_value=_token_for_user(user_id)):
        async with Client(mcp) as client:
            with pytest.raises(ToolError) as excinfo:
                if through_proxy:
                    await client.call_tool("call_tool", {"name": name, "arguments": arguments})
                else:
                    await client.call_tool(name, arguments)
    return excinfo.value


TOOL_BODY_ARGUMENT_FAILURES = [
    ("create_label", {"name": "Focus", "color": PRIVATE}, "color"),
    ("set_work_location", {"value_date": "2026-10-22", "country_code": PRIVATE}, "country_code"),
]


@pytest.mark.parametrize("through_proxy", [False, True], ids=["direct", "call_tool_proxy"])
@pytest.mark.parametrize(("tool", "arguments", "field"), TOOL_BODY_ARGUMENT_FAILURES)
async def test_tool_body_argument_failures_are_sanitised_and_not_audited(
    test_db: AsyncEngine,
    caplog: pytest.LogCaptureFixture,
    tool: str,
    arguments: dict,
    field: str,
    through_proxy: bool,
) -> None:
    factory = _make_factory(test_db)
    user_id = await _owner(factory)
    before = await _audit_count(factory)

    with caplog.at_level(logging.DEBUG):
        error = await _call(create_mcp_server(factory), user_id, tool, arguments, through_proxy=through_proxy)

    assert "Invalid arguments" in str(error)
    assert field in str(error)
    assert "input_value" not in str(error)
    assert PRIVATE not in str(error)
    assert PRIVATE not in caplog.text
    assert "input_value" not in caplog.text
    assert not [record for record in caplog.records if record.levelno >= logging.ERROR]
    assert await _audit_count(factory) == before


class _StoredRecord(BaseModel):
    name: str = Field(max_length=10)


@pytest.mark.parametrize("through_proxy", [False, True], ids=["direct", "call_tool_proxy"])
async def test_invalid_stored_result_is_correlated_and_distinct_from_argument_failures(
    test_db: AsyncEngine, caplog: pytest.LogCaptureFixture, through_proxy: bool
) -> None:
    factory = _make_factory(test_db)
    user_id = await _owner(factory)

    async def invalid_stored_row(_self: WorktimeMcpBackend) -> dict[str, Any]:
        return _StoredRecord.model_validate({"name": PRIVATE + "x" * 50}).model_dump()

    with patch.object(WorktimeMcpBackend, "list_labels", invalid_stored_row):
        mcp = create_mcp_server(factory)
    with caplog.at_level(logging.DEBUG):
        error = await _call(mcp, user_id, "list_labels", {}, through_proxy=through_proxy)

    message = str(error)
    assert "could not return a valid result" in message
    assert "Invalid arguments" not in message
    assert PRIVATE not in message
    assert PRIVATE not in caplog.text
    reference = message.rsplit("reference ", 1)[1].rstrip(").")
    assert any(reference in record.getMessage() for record in caplog.records)


@pytest.mark.parametrize("through_proxy", [False, True], ids=["direct", "call_tool_proxy"])
async def test_wrong_argument_types_and_unknown_tools_are_rejected(
    test_db: AsyncEngine, caplog: pytest.LogCaptureFixture, through_proxy: bool
) -> None:
    factory = _make_factory(test_db)
    user_id = await _owner(factory)
    mcp = create_mcp_server(factory)

    with caplog.at_level(logging.DEBUG):
        wrong_type = await _call(
            mcp, user_id, "get_time_off_summary", {"start_date": PRIVATE}, through_proxy=through_proxy
        )
    error_records = [record for record in caplog.records if record.levelno >= logging.ERROR]
    unknown = await _call(mcp, user_id, "no_such_tool", {}, through_proxy=through_proxy)

    assert "Invalid arguments for 'get_time_off_summary': start_date" in str(wrong_type)
    assert "input_value" not in str(wrong_type)
    assert PRIVATE not in str(wrong_type)
    assert PRIVATE not in caplog.text
    # A bad call is not a server fault: nothing at error level, so no traceback carrying the value.
    assert not error_records
    assert "Unknown tool 'no_such_tool'" in str(unknown)
    assert "search_tools" in str(unknown)


async def test_multiauth_resolves_keycloak_and_integration_principals_over_stateless_http(
    test_db: AsyncEngine, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Drive the real HTTP app (MultiAuth, rate-limit middleware, stateless transport) with both credential types.

    FastMCP 4.1 qualifies MultiAuth client IDs by source (issue #1480). The principal must resolve from token
    claims rather than the ``client_id`` shape, discovery and proxied calls must work, a bad credential must be
    a 401, and the transport must stay stateless (no session to expire under the SDK's 30-minute idle default).
    """
    factory = _make_factory(test_db)
    user_id = await _owner(factory, "http-e2e")
    async with factory() as session:
        integration, key = await integration_client_service.create_integration_client(
            session, user_id, name="e2e-client"
        )

    def stand_in_keycloak(*, realm_url: str, base_url: str, audience: str | None, required_scopes: list[str]):
        return RemoteAuthProvider(
            token_verifier=JWTVerifier(public_key=KEYS.public_key, issuer=realm_url, audience=audience),
            authorization_servers=[AnyHttpUrl(realm_url)],
            base_url=base_url,
        )

    monkeypatch.setenv("WORKTIME_MCP_KEYCLOAK_REALM_URL", ISSUER)
    monkeypatch.setattr("app.mcp_server.settings.OIDC_AUDIENCE", "worktime")
    with patch("app.mcp_server.KeycloakAuthProvider", stand_in_keycloak):
        _server, app = create_mcp_http_app(factory, path="/", stateless_http=True)
    keycloak_token = KEYS.create_token(
        subject="keycloak-subject-1",
        issuer=ISSUER,
        audience="worktime",
        additional_claims={"preferred_username": "kc-user", "name": "Keycloak User"},
    )

    # FastMCP 4.1 and the MCP SDK speak httpx2 (a separate package from httpx).
    def client_factory(
        headers: dict[str, str] | None = None,
        timeout: httpx2.Timeout | None = None,
        auth: httpx2.Auth | None = None,
        follow_redirects: bool = True,
    ) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(
            transport=httpx2.ASGITransport(app=app),
            headers=headers,
            timeout=timeout,
            auth=auth,
            follow_redirects=follow_redirects,
        )

    def transport(token: str) -> StreamableHttpTransport:
        return StreamableHttpTransport(
            "http://test/", headers={"Authorization": f"Bearer {token}"}, httpx_client_factory=client_factory
        )

    async with app.router.lifespan_context(app):
        async with Client(transport(key)) as mcp_client:
            whoami = (await mcp_client.call_tool("whoami", {})).structured_content
            labels = (
                await mcp_client.call_tool("call_tool", {"name": "list_labels", "arguments": {}})
            ).structured_content
            found = (await mcp_client.call_tool("search_tools", {"query": "time off"})).structured_content
            repeated = (await mcp_client.call_tool("search_tools", {"query": "time off"})).structured_content
        async with Client(transport(keycloak_token)) as mcp_client:
            keycloak_whoami = (await mcp_client.call_tool("whoami", {})).structured_content

        initialize = {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-06-18",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "0"},
            },
        }
        headers = {"Accept": "application/json, text/event-stream", "Content-Type": "application/json"}
        async with client_factory() as http:
            ok = await http.post("http://test/", json=initialize, headers={**headers, "Authorization": f"Bearer {key}"})
            bad = await http.post(
                "http://test/", json=initialize, headers={**headers, "Authorization": "Bearer wtic_not-a-key"}
            )
            missing = await http.post("http://test/", json=initialize, headers=headers)

    assert whoami is not None
    assert whoami["user_id"] == user_id
    assert whoami["auth_type"] == "integration_client"
    assert whoami["integration_client"]["id"] == integration.id
    assert keycloak_whoami is not None
    assert keycloak_whoami["auth_type"] == "oidc"
    assert keycloak_whoami["user_id"] != user_id
    assert labels == {"labels": []}
    assert found is not None
    assert "get_time_off_summary" in [item["name"] for item in found["result"]]
    assert repeated == found
    assert ok.status_code == 200
    assert "mcp-session-id" not in ok.headers
    assert bad.status_code == 401
    assert missing.status_code == 401
