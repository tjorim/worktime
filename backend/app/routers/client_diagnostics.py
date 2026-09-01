"""Privacy-minimized diagnostics reported by the authenticated web client."""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field

from app.routers.auth import AuthenticatedPrincipal, require_oidc_principal

logger = logging.getLogger("worktime.client_diagnostics")

router = APIRouter(prefix="/client-diagnostics", tags=["Diagnostics"])


class SyncDiagnosticPhase(StrEnum):
    STATUS = "status"
    LOCAL_READ = "local_read"
    PUSH = "push"
    PULL = "pull"
    LOCAL_APPLY = "local_apply"
    PREFERENCES = "preferences"
    CURSOR = "cursor"


class SyncEntityCounts(BaseModel):
    """Aggregate counts only; client record contents are deliberately forbidden."""

    model_config = ConfigDict(extra="forbid")

    labels: int = Field(default=0, ge=0, le=1_000_000)
    tasks: int = Field(default=0, ge=0, le=1_000_000)
    templates: int = Field(default=0, ge=0, le=1_000_000)
    work_locations: int = Field(default=0, ge=0, le=1_000_000)
    time_off_entries: int = Field(default=0, ge=0, le=1_000_000)
    gantt_tasks: int = Field(default=0, ge=0, le=1_000_000)


class ClientSyncDiagnostic(BaseModel):
    """A bounded event shape that cannot carry user records or credentials."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    event: Literal["sync_failure", "sync_conflict"]
    attempt_id: UUID
    app_version: str = Field(pattern=r"^\d{4}\.\d{1,2}\.\d+$")
    phase: SyncDiagnosticPhase
    code: str = Field(pattern=r"^[a-z0-9_]{1,64}$")
    error_name: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_.-]{1,120}$")
    conflict_count: int = Field(default=0, ge=0, le=1_000_000)
    entity_counts: SyncEntityCounts = Field(default_factory=SyncEntityCounts)
    request_ids: list[UUID] = Field(default_factory=list, max_length=20)


@router.post("", status_code=status.HTTP_204_NO_CONTENT)
async def report_client_diagnostic(
    payload: ClientSyncDiagnostic,
    request: Request,
    principal: AuthenticatedPrincipal = Depends(require_oidc_principal),
) -> Response:
    """Write a structured operational event without storing client record data."""

    logger.warning(
        "client_sync event=%s attempt_id=%s app_version=%s phase=%s code=%s "
        "error_name=%s conflict_count=%d entity_counts=%s api_request_ids=%s "
        "client_request_id=%s user=%d",
        payload.event,
        payload.attempt_id,
        payload.app_version,
        payload.phase,
        payload.code,
        payload.error_name or "-",
        payload.conflict_count,
        payload.entity_counts.model_dump(),
        [str(value) for value in payload.request_ids],
        getattr(request.state, "request_id", "-"),
        principal.user_id,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
