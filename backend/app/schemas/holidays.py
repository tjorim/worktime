"""Holiday proxy schemas."""

from __future__ import annotations

from datetime import date as dt_date

from pydantic import BaseModel, Field

from app.schemas.base import ResponseModel

# Holiday proxies
# These routes pass the upstream JSON through unchanged (``JSONResponse``), so the
# models below document the fields Worktime relies on rather than validate them.
# Fields the upstream may omit are optional; unknown upstream fields pass through.


# Plain BaseModel: the holiday proxies forward the upstream JSON, which omits some of these fields.
class PublicHolidayRead(BaseModel):
    """One entry from date.nager.at ``/PublicHolidays``, already filtered to ``types`` containing ``Public``."""

    date: dt_date
    localName: str
    name: str
    countryCode: str
    is_global: bool = Field(alias="global")
    counties: list[str] | None = None
    types: list[str]
    fixed: bool | None = None
    launchYear: int | None = None


class SchoolHolidayName(ResponseModel):
    language: str
    text: str


# Plain BaseModel: forwarded upstream JSON (see PublicHolidayRead).
class SchoolHolidaySubdivision(BaseModel):
    code: str
    shortName: str | None = None


# Plain BaseModel: forwarded upstream JSON (see PublicHolidayRead).
class SchoolHolidayRead(BaseModel):
    """One entry from openholidaysapi.org ``/SchoolHolidays``."""

    id: str
    startDate: dt_date
    endDate: dt_date
    type: str
    name: list[SchoolHolidayName]
    regionalScope: str
    temporalScope: str
    nationwide: bool
    # The upstream omits this for nationwide holidays.
    subdivisions: list[SchoolHolidaySubdivision] | None = None


class LongWeekendRead(ResponseModel):
    """One period from date.nager.at ``/LongWeekend``."""

    startDate: dt_date
    endDate: dt_date
    dayCount: int
    needBridgeDay: bool
    bridgeDays: list[dt_date]
