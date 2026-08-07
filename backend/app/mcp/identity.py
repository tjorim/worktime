"""Identity domain: whoami / capability self-description."""

from __future__ import annotations

from typing import Any

from app.mcp.context import WorktimeMcpContext


async def whoami(context: WorktimeMcpContext) -> dict[str, Any]:
    """Describe the authenticated caller, including managed integration-client identity.

    When the caller authenticated via a managed integration client (issue
    #1054), the response includes that client's id/name/scopes so the caller
    can confirm what it's authorized for — never raw key material, which the
    server never has access to after creation/rotation (only the HMAC hash is
    stored).
    """
    integration_client: dict[str, Any] | None = None
    if context.auth_type == "integration_client":
        integration_client = {
            "id": context.claims.get("worktime_integration_client_id"),
            "name": context.claims.get("worktime_integration_client_name"),
            "scopes": context.claims.get("worktime_integration_client_scopes"),
        }

    return {
        "user_id": context.user_id,
        "username": context.username,
        "display_name": context.display_name,
        "is_admin": context.is_admin,
        "subject": context.subject,
        "auth_type": context.auth_type,
        "scopes": context.scopes,
        "integration_client": integration_client,
    }
