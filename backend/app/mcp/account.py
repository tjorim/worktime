"""Owner-scoped audit, preferences, and managed-client MCP operations."""

from __future__ import annotations

from typing import Any, cast

from sqlalchemy.ext.asyncio import AsyncSession

from app.audit.db import DEFAULT_AUDIT_LIMIT, MAX_AUDIT_LIMIT, list_audit_entries
from app.mcp.context import WorktimeMcpContext, actor_from_context
from app.schemas import (
    AuditEntryRead,
    IntegrationClientRead,
    IntegrationClientScope,
    UserPreferencesRead,
)
from app.services.db_service import get_user_preferences
from app.services.integration_client_service import (
    ADMIN_SCOPE,
    DEFAULT_RATE_LIMIT_PER_MINUTE,
    create_integration_client,
    list_integration_clients_for_user,
    revoke_integration_client,
    rotate_integration_client,
)


def _require_interactive(context: WorktimeMcpContext) -> None:
    if context.auth_type != "oidc":
        raise PermissionError("Integration-client management requires an interactive OIDC user")


async def list_audit_entries_tool(
    context: WorktimeMcpContext,
    db: AsyncSession,
    limit: int = DEFAULT_AUDIT_LIMIT,
    before_id: int | None = None,
) -> dict[str, Any]:
    limit = max(1, min(limit, MAX_AUDIT_LIMIT))
    entries = await list_audit_entries(
        db,
        requesting_user_id=context.user_id,
        is_admin=False,
        target_user_id=context.user_id,
        limit=limit,
        before_id=before_id,
    )
    items = [AuditEntryRead.model_validate(entry, from_attributes=True).model_dump(mode="json") for entry in entries]
    return {"items": items, "total": len(items)}


async def get_preferences(context: WorktimeMcpContext, db: AsyncSession) -> dict[str, Any] | None:
    prefs = await get_user_preferences(db, context.user_id)
    return (
        UserPreferencesRead.model_validate(prefs, from_attributes=True).model_dump(mode="json")
        if prefs is not None
        else None
    )


async def list_integration_clients(context: WorktimeMcpContext, db: AsyncSession) -> dict[str, Any]:
    _require_interactive(context)
    clients = await list_integration_clients_for_user(db, context.user_id)
    items = [
        IntegrationClientRead.model_validate(client, from_attributes=True).model_dump(mode="json") for client in clients
    ]
    return {"items": items, "total": len(items)}


async def create_integration_client_tool(
    context: WorktimeMcpContext,
    db: AsyncSession,
    name: str,
    scopes: list[IntegrationClientScope] | None = None,
    rate_limit_per_minute: int = DEFAULT_RATE_LIMIT_PER_MINUTE,
) -> dict[str, Any]:
    _require_interactive(context)
    effective_scopes = list(["worktime:mcp"] if scopes is None else scopes)
    if ADMIN_SCOPE in effective_scopes and not context.is_admin:
        raise PermissionError("Admin privileges are required to grant worktime:admin")
    client, raw_key = await create_integration_client(
        db,
        context.user_id,
        name=name,
        scopes=effective_scopes,
        rate_limit_per_minute=rate_limit_per_minute,
        actor=actor_from_context(context),
    )
    return {
        **IntegrationClientRead.model_validate(client, from_attributes=True).model_dump(mode="json"),
        "key": raw_key,
        "scopes": cast(list[IntegrationClientScope], client.scopes),
    }


async def rotate_integration_client_tool(
    context: WorktimeMcpContext, db: AsyncSession, client_id: int
) -> dict[str, Any]:
    _require_interactive(context)
    client, raw_key = await rotate_integration_client(db, context.user_id, client_id, actor=actor_from_context(context))
    return {
        **IntegrationClientRead.model_validate(client, from_attributes=True).model_dump(mode="json"),
        "key": raw_key,
    }


async def revoke_integration_client_tool(
    context: WorktimeMcpContext, db: AsyncSession, client_id: int
) -> dict[str, Any]:
    _require_interactive(context)
    await revoke_integration_client(db, context.user_id, client_id, actor=actor_from_context(context))
    return {"revoked": True, "client_id": client_id}
