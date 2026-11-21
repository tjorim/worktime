"""Integration client schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from typing import Literal, cast

from pydantic import Field, field_validator

from app.schemas.base import ListResponse, RequestModel, ResponseModel

IntegrationClientScope = Literal["worktime:mcp", "worktime:admin"]


class IntegrationClientCreate(RequestModel):
    """Payload for provisioning a new managed integration client (issue #1054).

    ``worktime:admin`` is a deliberate, explicit grant — never implied by
    ``worktime:mcp`` — matching Worktime's existing ``is_admin`` semantics.
    Only an admin caller may request it; see
    app.routers.integration_clients.create_integration_client_endpoint.
    """

    name: str = Field(min_length=1, max_length=120)
    scopes: list[IntegrationClientScope] = Field(
        default_factory=lambda: cast(list[IntegrationClientScope], ["worktime:mcp"])
    )
    rate_limit_per_minute: int = Field(default=120, ge=1, le=6000)

    @field_validator("scopes")
    @classmethod
    def deduplicate_scopes(cls, value: list[IntegrationClientScope]) -> list[IntegrationClientScope]:
        if not value:
            raise ValueError("at least one scope is required")
        return list(dict.fromkeys(value))


class IntegrationClientCreated(ResponseModel):
    """Response returned once, at creation/rotation time, including the raw key value."""

    id: int
    name: str
    key: str
    scopes: list[IntegrationClientScope]
    rate_limit_per_minute: int
    created_at: dt_datetime


class IntegrationClientRead(ResponseModel):
    """A previously issued integration client, without its raw key."""

    id: int
    name: str
    key_preview: str
    scopes: list[IntegrationClientScope]
    rate_limit_per_minute: int
    is_active: bool
    created_at: dt_datetime
    last_used_at: dt_datetime | None
    revoked_at: dt_datetime | None


class IntegrationClientListResponse(ListResponse[IntegrationClientRead]):
    pass
