"""User request/response schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from typing import Any

from pydantic import Field

from app.schemas.base import ListResponse, RequestModel, ResponseModel


class UserRegister(RequestModel):
    """Payload for the admin-only pre-registration endpoint.

    ``display_name`` is optional; it defaults to the username when omitted.
    Authentication is handled by the OIDC provider; no password is stored locally.

    Explicit writes share ``services.user_validation`` with create/update,
    returning stable error codes. Response schemas and OIDC provisioning do
    not impose these rules on existing identities.
    """

    username: str
    display_name: str | None = None


class UserCreate(RequestModel):
    username: str
    display_name: str
    settings: dict[str, Any] = Field(default_factory=dict)


class UserRead(ResponseModel):
    id: int
    username: str
    display_name: str
    settings: dict[str, Any]
    created_at: dt_datetime
    updated_at: dt_datetime


class UserUpdate(RequestModel):
    username: str | None = None
    display_name: str | None = None
    settings: dict[str, Any] | None = None


class UserListResponse(ListResponse[UserRead]):
    pass
