"""Health, liveness and readiness endpoint schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.schemas.base import ResponseModel


class HealthLinks(ResponseModel):
    """Paths of the dependency probes, relative to the host."""

    liveness: str
    readiness: str


class HealthSummary(ResponseModel):
    """Static overview returned by ``GET /api/health``."""

    status: Literal["ok"]
    version: str
    commit: str
    liveness_endpoint: str
    readiness_endpoint: str
    # The same two paths, nested: kept for readers of the first version of this response.
    links: HealthLinks


class LivenessResponse(ResponseModel):
    """Process-level alive signal; never touches a dependency."""

    status: Literal["alive"]


DependencyStatus = Literal["ok", "unreachable"]


# Plain BaseModel: the route leaves ``database`` out when no database is configured.
class ReadinessResponse(BaseModel):
    """Result of the dependency checks; returned with HTTP 200 (``ready``) or 503 (``not_ready``)."""

    status: Literal["ready", "not_ready"]
    auth: DependencyStatus
    # Absent (not null) when DATABASE_ENABLED is false, so the database was not checked.
    database: DependencyStatus | None = None
