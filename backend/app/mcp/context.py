"""Shared MCP call context: principal type, error types, and cross-cutting helpers.

Kept separate from ``app.mcp_server`` (the assembler) so the domain modules
in this package can import it without a circular dependency on the
assembler, which in turn imports the domain modules.
"""

from __future__ import annotations

import functools
import logging
import secrets
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Concatenate

from fastmcp.exceptions import ToolError
from pydantic import BaseModel
from pydantic import ValidationError as PydanticValidationError

from app.audit.db import AuditActor
from app.services.db_service import ConflictError, NotFoundError, ValidationError

if TYPE_CHECKING:
    from app.mcp_server import WorktimeMcpBackend

logger = logging.getLogger(__name__)


class McpAuthError(RuntimeError):
    """Raised when MCP authentication context is missing or invalid."""


class McpPermissionError(RuntimeError):
    """Raised when MCP caller is authenticated but not authorized."""


class McpRateLimitError(RuntimeError):
    """Raised when an integration-client caller exceeds its configured rate limit.

    MCP tool calls are JSON-RPC, not HTTP, so there's no 429 status code to
    return — raising here surfaces a clear, actionable error message to the
    calling model/client instead, which is the closest MCP equivalent.
    """


@dataclass(frozen=True)
class WorktimeMcpContext:
    user_id: int
    username: str
    display_name: str
    is_admin: bool
    subject: str | None
    claims: dict[str, Any]
    scopes: list[str]
    auth_type: str


def actor_from_context(context: WorktimeMcpContext) -> AuditActor:
    """Build the transactional-audit actor identity for an authenticated MCP call.

    For integration-client calls, the label is the managed client's own name
    (never raw key material — the client only ever sees a hash) so the audit
    trail reads as e.g. ``integration:home-assistant`` rather than an opaque
    user id.
    """
    label = context.username
    if context.auth_type == "integration_client":
        client_name = context.claims.get("worktime_integration_client_name")
        client_id = context.claims.get("worktime_integration_client_id")
        label = f"integration:{client_name or client_id}"
    return AuditActor(
        user_id=context.user_id,
        label=label,
        auth_source=context.auth_type,
        subject=context.subject,
    )


def map_domain_errors[**P, R](
    func: Callable[Concatenate[WorktimeMcpBackend, P], Awaitable[R]],
) -> Callable[Concatenate[WorktimeMcpBackend, P], Awaitable[R]]:
    """Translate db_service domain exceptions into ValueError for MCP callers.

    Without this, only delete_label mapped ConflictError to ValueError —
    every other write tool let ConflictError / NotFoundError / ValidationError
    (e.g. "only one running task is allowed per user") propagate raw, so the
    calling model saw an opaque failure instead of the actionable message the
    exception already carries. Apply to every write tool method.
    """

    @functools.wraps(func)
    async def wrapper(self: WorktimeMcpBackend, *args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return await func(self, *args, **kwargs)
        except (ConflictError, NotFoundError, ValidationError) as exc:
            raise ValueError(str(exc)) from exc

    return wrapper


def describe_validation_error(exc: PydanticValidationError) -> str:
    """Summarise a Pydantic failure as ``field: message`` pairs, never echoing input or context values."""
    return "; ".join(
        f"{'.'.join(str(part) for part in error['loc']) or 'input'}: {error['msg']}"
        for error in exc.errors(include_input=False, include_url=False, include_context=False)
    )


def validate_arguments[M: BaseModel](model: type[M], payload: Mapping[str, Any]) -> M:
    """Validate tool arguments against ``model`` and report failures without echoing the caller's values.

    Pydantic's default message (and the exception chained to it) carries the
    offending ``input_value``, which FastMCP logs and returns to the client.
    """
    try:
        return model.model_validate(payload)
    except PydanticValidationError as exc:
        raise ValueError(f"Invalid arguments: {describe_validation_error(exc)}") from None


def guard_invalid_results[**P, R](tool_name: str, func: Callable[P, Awaitable[R]]) -> Callable[P, Awaitable[R]]:
    """Report a Pydantic ``ValidationError`` escaping a tool body as an invalid stored/generated result.

    Argument failures are already turned into ``ValueError`` by ``validate_arguments``,
    so a Pydantic error that still reaches the tool boundary came from building a
    response or reading stored data. FastMCP 4.1 logs and wraps that error, input
    values included, before any middleware runs, so it is sanitised here. The client
    gets a correlation reference and the log gets field paths and error types only.
    """

    @functools.wraps(func)
    async def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
        try:
            return await func(*args, **kwargs)
        except PydanticValidationError as exc:
            reference = secrets.token_hex(6)
            logger.error(
                "MCP tool %s produced an invalid result (ref=%s, errors=%s)",
                tool_name,
                reference,
                [(".".join(str(part) for part in e["loc"]), e["type"]) for e in exc.errors(include_input=False)],
            )
            raise ToolError(
                f"{tool_name} could not return a valid result for the stored data (reference {reference})."
            ) from None

    return wrapper
