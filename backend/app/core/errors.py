"""Error responses that carry a stable, machine-readable ``code``.

``detail`` stays an English diagnostic string (logs, API consumers, support). Clients
that show errors to people key off ``code`` instead, so the interface can translate
the reason; see ``docs/api-errors.md``. Body shape::

    {"code": "snake_case_code", "detail": "English diagnostic"}

Raise ``api_error(...)`` wherever a route would raise ``HTTPException`` for an error
a user can reach. Errors raised as plain ``HTTPException`` keep the ``{"detail": ...}``
body and the client falls back to its generic message for the status.
"""

from __future__ import annotations

from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse


class ErrorCode(StrEnum):
    """Stable error codes. Never rename or reuse one: clients map them to translations."""

    # Authentication / authorisation
    INVALID_ACCESS_TOKEN = "invalid_access_token"
    INVALID_TOKEN = "invalid_token"
    TOKEN_SUBJECT_MISSING = "token_subject_missing"
    SERVICE_ACCOUNT_FORBIDDEN = "service_account_forbidden"
    AUTH_SERVICE_ERROR = "auth_service_error"
    OIDC_NOT_CONFIGURED = "oidc_not_configured"
    OIDC_DISCOVERY_FAILED = "oidc_discovery_failed"
    INTERACTIVE_SESSION_REQUIRED = "interactive_session_required"
    OIDC_SESSION_REQUIRED = "oidc_session_required"
    MISSING_SCOPE = "missing_scope"
    ADMIN_REQUIRED = "admin_required"
    ADMIN_SCOPE_REQUIRED = "admin_scope_required"
    FORBIDDEN = "forbidden"

    # Resources
    USER_NOT_FOUND = "user_not_found"
    ACCESS_TOKEN_NOT_FOUND = "access_token_not_found"
    INTEGRATION_CLIENT_NOT_FOUND = "integration_client_not_found"

    NOT_FOUND = "not_found"
    CALENDAR_FEED_NOT_FOUND = "calendar_feed_not_found"
    PUSH_SUBSCRIPTION_NOT_FOUND = "push_subscription_not_found"
    FCM_TOKEN_NOT_FOUND = "fcm_token_not_found"
    NO_RUNNING_TASK = "no_running_task"

    # Conflicts / validation
    USERNAME_TAKEN = "username_taken"
    ADMIN_SELF_DELETE_FORBIDDEN = "admin_self_delete_forbidden"
    VALIDATION_FAILED = "validation_failed"
    CONFLICT = "conflict"
    UNSUPPORTED_COUNTRY = "unsupported_country"
    UNKNOWN_TIMEZONE = "unknown_timezone"
    AUDIT_ACCESS_DENIED = "audit_access_denied"

    # Sync
    SYNC_CURSOR_EXPIRED = "sync_cursor_expired"
    BULK_DELETE_BLOCKED = "bulk_delete_blocked"
    SYNC_STREAM_LIMIT_REACHED = "sync_stream_limit_reached"

    # Optional features not enabled on this server
    PUSH_NOT_CONFIGURED = "push_not_configured"
    FCM_NOT_CONFIGURED = "fcm_not_configured"


class ApiHTTPException(HTTPException):
    """``HTTPException`` that also reports a stable ``code`` in the response body."""

    def __init__(
        self,
        status_code: int,
        code: ErrorCode,
        detail: Any,
        headers: Mapping[str, str] | None = None,
    ) -> None:
        super().__init__(status_code=status_code, detail=detail, headers=dict(headers) if headers else None)
        self.code = code


def api_error(
    status_code: int,
    code: ErrorCode,
    detail: Any,
    headers: Mapping[str, str] | None = None,
) -> ApiHTTPException:
    """Build an exception to ``raise``; the handler renders ``{"code", "detail"}``.

    ``detail`` is an English string, except where an existing client contract needs a
    structured object (``sync_cursor_expired``).
    """
    return ApiHTTPException(status_code, code, detail, headers)


async def handle_api_http_exception(request: Request, exc: Exception) -> JSONResponse:
    """Render an ``ApiHTTPException`` as ``{"code": ..., "detail": ...}``."""
    if not isinstance(exc, ApiHTTPException):
        raise exc
    return JSONResponse(
        {"code": exc.code.value, "detail": exc.detail},
        status_code=exc.status_code,
        headers=exc.headers,
    )
