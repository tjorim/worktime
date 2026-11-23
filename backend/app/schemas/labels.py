"""Label schemas."""

from __future__ import annotations

from datetime import datetime as dt_datetime

from pydantic import Field, field_validator

from app.schemas.base import ListResponse, RequestModel, ResponseModel


def _validate_hex_color(value: str | None) -> str | None:
    """Validate that a color value is in #RRGGBB hex format."""
    if value is None:
        return None
    if not value.startswith("#") or len(value) != 7:
        raise ValueError("color must be in #RRGGBB format")
    try:
        int(value[1:], 16)
    except ValueError as error:
        raise ValueError("color must be in #RRGGBB format") from error
    return value.upper()


class LabelCreate(RequestModel):
    name: str
    color: str

    @field_validator("color")
    @classmethod
    def validate_hex_color(cls, value: str) -> str:
        result = _validate_hex_color(value)
        if result is None:
            raise ValueError("color must be in #RRGGBB format")
        return result


class LabelRead(ResponseModel):
    id: str
    user_id: int = Field(deprecated=True)
    name: str
    color: str
    created_at: dt_datetime
    updated_at: dt_datetime


class LabelUpdate(RequestModel):
    name: str | None = None
    color: str | None = None

    @field_validator("color")
    @classmethod
    def validate_hex_color(cls, value: str | None) -> str | None:
        return _validate_hex_color(value)


class LabelListResponse(ListResponse[LabelRead]):
    pass
