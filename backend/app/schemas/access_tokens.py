"""Personal access token schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.base import ListResponse, RequestModel, ResponseModel

AccessTokenScope = Literal["pebble:read", "pebble:write"]


class AccessTokenCreate(RequestModel):
    """Payload for minting a new personal access token."""

    name: str = Field(min_length=1, max_length=100)
    scopes: list[AccessTokenScope] = ["pebble:read"]

    @field_validator("scopes")
    @classmethod
    def deduplicate_scopes(cls, value: list[AccessTokenScope]) -> list[AccessTokenScope]:
        if not value:
            raise ValueError("at least one scope is required")
        return list(dict.fromkeys(value))


class AccessTokenCreated(ResponseModel):
    """Response returned once, at creation time, including the raw token value."""

    id: str
    name: str
    token: str
    scopes: list[AccessTokenScope]
    created_at: dt_datetime


class AccessTokenRead(ResponseModel):
    """A previously issued token, without its raw secret value."""

    id: str
    name: str
    token_preview: str
    scopes: list[AccessTokenScope]
    created_at: dt_datetime
    last_used_at: dt_datetime | None


class AccessTokenListResponse(ListResponse[AccessTokenRead]):
    pass
