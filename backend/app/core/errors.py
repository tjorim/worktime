"""Error responses that carry a stable, machine-readable ``code``.

``detail`` stays an English diagnostic string (logs, API consumers, support). Clients
that show errors to people key off ``code`` instead, so the interface can translate
the reason; see ``docs/api-errors.md``. Body shape::

    {"code": "snake_case_code", "detail": "English diagnostic"}

Raise ``api_error(...)`` wherever a route would raise ``HTTPException`` for an error
a user can reach. Errors raised as plain ``HTTPException`` (and the framework's own: an
unknown route, a wrong method) keep their ``detail`` and get a ``code`` from the status
(``handle_http_exception``); a 422 keeps FastAPI's ``detail`` list without the submitted
values and gets ``code: "validation_error"`` (``handle_validation_error``); an unhandled
exception answers ``{"detail": "Internal server error", "code": "internal_error"}``
(``handle_unhandled_exception``).
"""

from __future__ import annotations

import logging
import uuid
from collections.abc import Mapping
from enum import StrEnum
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, Response
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)

REQUEST_ID_HEADER = "X-Request-ID"
INTERNAL_ERROR_DETAIL = "Internal server error"
INTERNAL_ERROR_CODE = "internal_error"
VALIDATION_ERROR_CODE = "validation_error"


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
    USERNAME_INVALID = "username_invalid"
    USERNAME_RESERVED = "username_reserved"
    DISPLAY_NAME_INVALID = "display_name_invalid"
    USERNAME_TAKEN = "username_taken"
    ADMIN_SELF_DELETE_FORBIDDEN = "admin_self_delete_forbidden"
    VALIDATION_FAILED = "validation_failed"
    CONFLICT = "conflict"
    GANTT_DEPENDENCY_UNKNOWN = "gantt_dependency_unknown"
    GANTT_DEPENDENCY_SELF = "gantt_dependency_self"
    GANTT_DEPENDENCY_CYCLE = "gantt_dependency_cycle"
    TASK_OVERLAP = "task_overlap"
    LABEL_REQUIRED = "label_required"
    TASK_TEXT_INVALID = "task_text_invalid"
    TASK_DURATION_INVALID = "task_duration_invalid"
    TASK_TIMEZONE_REQUIRED = "task_timezone_required"
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


def internal_error_response() -> JSONResponse:
    """The body of every unhandled exception: ``{"detail": "Internal server error", "code": "internal_error"}``.

    Never carries the exception, its message or a stack trace; those stay in the server log and in Sentry.
    """
    return JSONResponse({"detail": INTERNAL_ERROR_DETAIL, "code": INTERNAL_ERROR_CODE}, status_code=500)


async def handle_unhandled_exception(request: Request, exc: Exception) -> Response:
    """Answer an exception no other handler took with the JSON 500 and the request id.

    Starlette sends this from its outermost ``ServerErrorMiddleware`` (and then re-raises for the server and Sentry),
    after ``RequestIdMiddleware`` has unwound, so the id is read from ``request.state`` and set here; a fresh one is
    used when the middleware never got that far. The stack trace goes to the server log only, never the body.
    """
    request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
    # Log the route template, never the raw path: it can carry a credential (the calendar feed token in /ical/{token}.ics).
    route = getattr(request.scope.get("route"), "path", None)
    logger.error(
        "Unhandled error: %s %s (request_id=%s)",
        request.method,
        route if isinstance(route, str) else "unmatched",
        request_id,
        exc_info=exc,
    )
    response = internal_error_response()
    response.headers[REQUEST_ID_HEADER] = request_id
    return response


_STATUS_CODES = {
    400: "bad_request",
    401: "unauthorized",
    403: "forbidden",
    404: "not_found",
    405: "method_not_allowed",
}


def default_error_code(status_code: int) -> str:
    """The stable ``code`` for an HTTP error that carries none of its own (``http_<status>`` when not listed)."""
    return _STATUS_CODES.get(status_code, f"http_{status_code}")


async def handle_http_exception(request: Request, exc: Exception) -> Response:
    """Render a framework or dependency ``HTTPException`` with its ``detail`` unchanged and a ``code`` added.

    Replaces FastAPI's default handler (unknown route, wrong method, a bare ``HTTPException``). A ``code`` the
    exception already carries (``ApiHTTPException``) is kept, and its headers (``WWW-Authenticate``, ``Retry-After``,
    ``Allow``) are passed on.
    """
    if not isinstance(exc, StarletteHTTPException):
        raise exc
    headers = getattr(exc, "headers", None)
    if exc.status_code < 200 or exc.status_code in (204, 304):
        return Response(status_code=exc.status_code, headers=headers)
    code = getattr(exc, "code", None) or default_error_code(exc.status_code)
    return JSONResponse(
        {"detail": exc.detail, "code": str(getattr(code, "value", code))},
        status_code=exc.status_code,
        headers=headers,
    )


# ``input`` (the submitted value) and ``ctx`` (constraint values, sometimes the raw cause) can echo secrets or PII.
_UNSAFE_VALIDATION_KEYS = frozenset({"input", "ctx"})


async def handle_validation_error(request: Request, exc: Exception) -> Response:
    """Render a 422 as FastAPI's ``detail`` list (``type``, ``loc``, ``msg``) without the submitted values.

    ``detail`` stays a list, as the frontend and the generated client read it; ``code`` is added next to it.
    """
    if not isinstance(exc, RequestValidationError):
        raise exc
    detail = [
        {key: value for key, value in issue.items() if key not in _UNSAFE_VALIDATION_KEYS} for issue in exc.errors()
    ]
    return JSONResponse(
        {"detail": detail, "code": VALIDATION_ERROR_CODE}, status_code=status.HTTP_422_UNPROCESSABLE_CONTENT
    )


async def handle_label_validation_error(request: Request, exc: Exception) -> Response:
    """Keep missing/empty create labels machine-readable alongside schema validation."""
    assert isinstance(exc, RequestValidationError)
    if request.url.path.startswith("/api/time-tracking/") and any(
        error["loc"][:2] == ("body", "label_id") for error in exc.errors()
    ):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={"code": "label_required", "detail": "A label is required"},
        )
    return await handle_validation_error(request, exc)
