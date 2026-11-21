"""Work location schemas."""

from __future__ import annotations

from datetime import date as dt_date
from datetime import datetime as dt_datetime

from pydantic import field_validator

from app.schemas.base import ISO_ALPHA2_CODES, ListResponse, RequestModel, ResponseModel


class WorkLocationCreate(RequestModel):
    date: dt_date
    country_code: str
    label: str | None = None

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, value: str) -> str:
        normalized = value.upper()
        if normalized not in ISO_ALPHA2_CODES:
            raise ValueError("country_code must be ISO alpha-2")
        return normalized


class WorkLocationRead(ResponseModel):
    id: int
    user_id: int
    date: dt_date
    country_code: str
    label: str | None
    created_at: dt_datetime


class WorkLocationUpdate(RequestModel):
    country_code: str | None = None
    label: str | None = None

    _validate_country_code = field_validator("country_code")(WorkLocationCreate.validate_country_code)


class WorkLocationListResponse(ListResponse[WorkLocationRead]):
    pass
