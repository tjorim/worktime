"""User preferences schemas and the unversioned compatibility format."""

from __future__ import annotations

from datetime import datetime as dt_datetime
from typing import Annotated, Any, Literal

from pydantic import (
    AfterValidator,
    ConfigDict,
    Field,
    ValidationError,
    WithJsonSchema,
    field_validator,
    model_validator,
)

from app.schemas.base import ISO_ALPHA2_CODES, RequestModel, ResponseModel
from app.schemas.read_models import ScheduleType


def _validate_country(value: str) -> str:
    if value not in ISO_ALPHA2_CODES:
        raise ValueError("Expected an ISO 3166-1 alpha-2 country code")
    return value


CountryCode = Annotated[str, AfterValidator(_validate_country)]


class AccountSettings(ResponseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    timeFormat: Literal["12h", "24h"] = "24h"
    enableTimeOff: bool = False
    enableTimeTracking: bool = False
    enableGantt: bool = False
    enableCrossBorderTracking: bool = False
    enableUnifiedCalendar: bool = False
    homeCountry: CountryCode | None = None
    officeCountry: CountryCode | None = None
    hdayUsername: str | None = None


class AccountPreferences(ResponseModel):
    model_config = ConfigDict(extra="forbid", strict=True, serialize_by_alias=True)

    schemaVersion: Literal[1]
    scheduleType: ScheduleType | None = None
    myTeam: int | None = Field(default=None, ge=1, le=5)
    hasCompletedOnboarding: bool = False
    accountSyncAnnouncementSeen: bool | None = None
    ganttAnnouncementSeen: bool | None = None
    crossBorderAnnouncementSeen: bool | None = None
    settings: AccountSettings = Field(default_factory=AccountSettings)
    # Older clients compare this embedded timestamp with client_updated_at.
    updated_at: dt_datetime | None = Field(default=None, alias="_updatedAt", strict=False)

    @field_validator("schemaVersion", mode="before")
    @classmethod
    def validate_version(cls, value: object) -> object:
        if type(value) is not int or value != 1:
            raise ValueError("Unsupported account preferences version")
        return value

    @classmethod
    def from_stored(cls, data: dict[str, Any]) -> AccountPreferences:
        """Read known fields from historical blobs and default invalid fields independently."""
        candidate = {key: value for key, value in data.items() if key in cls.model_fields}
        candidate["schemaVersion"] = 1
        if isinstance(settings := candidate.get("settings"), dict):
            candidate["settings"] = {
                key: value for key, value in settings.items() if key in AccountSettings.model_fields
            }
        try:
            return cls.model_validate(candidate)
        except ValidationError as error:
            for item in error.errors():
                key, *nested = item["loc"]
                if key == "settings" and nested:
                    candidate["settings"].pop(nested[0], None)
                else:
                    candidate.pop(key, None)
            return cls.model_validate(candidate)


LegacyPreferences = Annotated[
    dict[str, Any],
    WithJsonSchema(
        {
            "type": "object",
            "additionalProperties": True,
            "not": {"required": ["schemaVersion"]},
            "description": "Unversioned preferences accepted for compatibility with older clients.",
        }
    ),
]


class UserPreferencesRead(ResponseModel):
    """The authenticated user's preferences, including legacy documents."""

    user_id: int = Field(deprecated=True)
    data: AccountPreferences | dict[str, Any] = Field(union_mode="left_to_right")
    client_updated_at: dt_datetime
    created_at: dt_datetime
    updated_at: dt_datetime


class UserPreferencesWrite(RequestModel):
    """Replace the document if the client timestamp is newer."""

    data: AccountPreferences | LegacyPreferences
    client_updated_at: dt_datetime

    @model_validator(mode="before")
    @classmethod
    def validate_versioned_data(cls, value: Any) -> Any:
        if isinstance(value, dict) and isinstance(data := value.get("data"), dict) and "schemaVersion" in data:
            # A malformed versioned write must never fall through to the legacy format.
            return {**value, "data": AccountPreferences.model_validate(data)}
        return value
