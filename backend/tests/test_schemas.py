"""Tests for Pydantic schema validators added in this PR.

Covers:
- TimeOffEntryCreate.validate_shape
- TimeOffEntryUpdate.validate_shape
- TimeOffEntrySyncCreateItem.validate_shape
- TimeOffEntrySyncUpdateItem.validate_shape
- UserRegister field constraints
- AccountCapabilities / AccountProfile structure
"""

from __future__ import annotations

from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.schemas import (
    AccountCapabilities,
    AccountProfile,
    TimeOffEntryCreate,
    TimeOffEntryUpdate,
    TimeOffEntrySyncCreateItem,
    TimeOffEntrySyncDeleteItem,
    TimeOffEntrySyncUpdateItem,
    UserRegister,
)

_NOW = datetime.now(timezone.utc)


# ---------------------------------------------------------------------------
# TimeOffEntryCreate shape validator
# ---------------------------------------------------------------------------


class TestTimeOffEntryCreateShape:
    """TimeOffEntryCreate must enforce mutually exclusive scheduling shapes."""

    # --- date kind ---

    def test_date_kind_with_date_is_valid(self) -> None:
        entry = TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 14))
        assert entry.date == date(2026, 7, 14)

    def test_date_kind_defaults_to_date(self) -> None:
        """entry_kind defaults to 'date'; date field must still be provided."""
        with pytest.raises(ValidationError, match="date is required"):
            TimeOffEntryCreate()

    def test_date_kind_missing_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="date is required"):
            TimeOffEntryCreate(entry_kind="date")

    def test_date_kind_with_start_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="date entries cannot include range or weekday fields"):
            TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), start_date=date(2026, 7, 1))

    def test_date_kind_with_end_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="date entries cannot include range or weekday fields"):
            TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), end_date=date(2026, 7, 2))

    def test_date_kind_with_weekday_raises(self) -> None:
        with pytest.raises(ValidationError, match="date entries cannot include range or weekday fields"):
            TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), weekday=1)

    # --- range kind ---

    def test_range_kind_valid(self) -> None:
        entry = TimeOffEntryCreate(
            entry_kind="range",
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 5),
        )
        assert entry.start_date == date(2026, 8, 1)
        assert entry.end_date == date(2026, 8, 5)

    def test_range_same_day_is_valid(self) -> None:
        """A single-day range (start == end) is allowed."""
        entry = TimeOffEntryCreate(
            entry_kind="range",
            start_date=date(2026, 9, 10),
            end_date=date(2026, 9, 10),
        )
        assert entry.start_date == entry.end_date

    def test_range_kind_missing_start_raises(self) -> None:
        with pytest.raises(ValidationError, match="start_date and end_date are required"):
            TimeOffEntryCreate(entry_kind="range", end_date=date(2026, 8, 5))

    def test_range_kind_missing_end_raises(self) -> None:
        with pytest.raises(ValidationError, match="start_date and end_date are required"):
            TimeOffEntryCreate(entry_kind="range", start_date=date(2026, 8, 1))

    def test_range_kind_end_before_start_raises(self) -> None:
        with pytest.raises(ValidationError, match="end_date cannot be earlier than start_date"):
            TimeOffEntryCreate(
                entry_kind="range",
                start_date=date(2026, 8, 10),
                end_date=date(2026, 8, 1),
            )

    def test_range_kind_with_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="range entries cannot include date or weekday fields"):
            TimeOffEntryCreate(
                entry_kind="range",
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 5),
                date=date(2026, 8, 3),
            )

    def test_range_kind_with_weekday_raises(self) -> None:
        with pytest.raises(ValidationError, match="range entries cannot include date or weekday fields"):
            TimeOffEntryCreate(
                entry_kind="range",
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 5),
                weekday=3,
            )

    # --- weekly kind ---

    def test_weekly_kind_valid(self) -> None:
        entry = TimeOffEntryCreate(entry_kind="weekly", weekday=1)
        assert entry.weekday == 1

    def test_weekly_weekday_boundary_1_is_valid(self) -> None:
        entry = TimeOffEntryCreate(entry_kind="weekly", weekday=1)
        assert entry.weekday == 1

    def test_weekly_weekday_boundary_7_is_valid(self) -> None:
        entry = TimeOffEntryCreate(entry_kind="weekly", weekday=7)
        assert entry.weekday == 7

    def test_weekly_kind_missing_weekday_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekday must be between 1 and 7"):
            TimeOffEntryCreate(entry_kind="weekly")

    def test_weekly_kind_weekday_zero_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekday must be between 1 and 7"):
            TimeOffEntryCreate(entry_kind="weekly", weekday=0)

    def test_weekly_kind_weekday_8_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekday must be between 1 and 7"):
            TimeOffEntryCreate(entry_kind="weekly", weekday=8)

    def test_weekly_kind_with_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekly entries cannot include date or range fields"):
            TimeOffEntryCreate(entry_kind="weekly", weekday=3, date=date(2026, 8, 1))

    def test_weekly_kind_with_start_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekly entries cannot include date or range fields"):
            TimeOffEntryCreate(entry_kind="weekly", weekday=3, start_date=date(2026, 8, 1))

    # --- entry_type / entry_flag validation ---

    def test_invalid_entry_type_raises(self) -> None:
        with pytest.raises(ValidationError):
            TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), entry_type="sick")

    def test_invalid_entry_flag_raises(self) -> None:
        with pytest.raises(ValidationError):
            TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), entry_flag="invalid")

    def test_all_valid_entry_types_accepted(self) -> None:
        valid_types = ["vacation", "business", "course", "in", "weekend", "birthday", "ill", "other"]
        for etype in valid_types:
            entry = TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), entry_type=etype)
            assert entry.entry_type == etype

    def test_all_valid_entry_flags_accepted(self) -> None:
        valid_flags = ["full_day", "half_am", "half_pm", "onsite", "no_fly", "can_fly"]
        for eflag in valid_flags:
            entry = TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), entry_flag=eflag)
            assert entry.entry_flag == eflag

    def test_entry_id_can_be_none(self) -> None:
        """entry_id is optional and defaults to None (server generates UUID)."""
        entry = TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1))
        assert entry.entry_id is None

    def test_entry_id_empty_string_raises(self) -> None:
        """Empty entry_id is invalid (min_length=1)."""
        with pytest.raises(ValidationError):
            TimeOffEntryCreate(entry_kind="date", date=date(2026, 7, 1), entry_id="")


# ---------------------------------------------------------------------------
# TimeOffEntryUpdate shape validator
# ---------------------------------------------------------------------------


class TestTimeOffEntryUpdateShape:
    """TimeOffEntryUpdate: shape fields require entry_kind; entry_kind constrains shape fields."""

    def test_empty_update_is_valid(self) -> None:
        """An empty PATCH body (no fields set) must be accepted."""
        update = TimeOffEntryUpdate()
        assert update.entry_kind is None

    def test_note_only_update_is_valid(self) -> None:
        """Updating only note does not require entry_kind."""
        update = TimeOffEntryUpdate(note="updated note")
        assert update.note == "updated note"
        assert update.entry_kind is None

    def test_date_without_entry_kind_raises(self) -> None:
        with pytest.raises(ValidationError, match="entry_kind must be provided"):
            TimeOffEntryUpdate(date=date(2026, 9, 1))

    def test_start_date_without_entry_kind_raises(self) -> None:
        with pytest.raises(ValidationError, match="entry_kind must be provided"):
            TimeOffEntryUpdate(start_date=date(2026, 9, 1))

    def test_end_date_without_entry_kind_raises(self) -> None:
        with pytest.raises(ValidationError, match="entry_kind must be provided"):
            TimeOffEntryUpdate(end_date=date(2026, 9, 1))

    def test_weekday_without_entry_kind_raises(self) -> None:
        with pytest.raises(ValidationError, match="entry_kind must be provided"):
            TimeOffEntryUpdate(weekday=3)

    def test_date_kind_with_date_is_valid(self) -> None:
        update = TimeOffEntryUpdate(entry_kind="date", date=date(2026, 9, 1))
        assert update.date == date(2026, 9, 1)

    def test_date_kind_without_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="date is required when entry_kind is date"):
            TimeOffEntryUpdate(entry_kind="date")

    def test_range_kind_valid(self) -> None:
        update = TimeOffEntryUpdate(
            entry_kind="range",
            start_date=date(2026, 9, 1),
            end_date=date(2026, 9, 5),
        )
        assert update.start_date is not None

    def test_range_kind_missing_start_raises(self) -> None:
        with pytest.raises(ValidationError, match="start_date and end_date are required"):
            TimeOffEntryUpdate(entry_kind="range", end_date=date(2026, 9, 5))

    def test_range_kind_missing_end_raises(self) -> None:
        with pytest.raises(ValidationError, match="start_date and end_date are required"):
            TimeOffEntryUpdate(entry_kind="range", start_date=date(2026, 9, 1))

    def test_range_kind_end_before_start_raises(self) -> None:
        with pytest.raises(ValidationError, match="end_date cannot be earlier than start_date"):
            TimeOffEntryUpdate(
                entry_kind="range",
                start_date=date(2026, 9, 10),
                end_date=date(2026, 9, 1),
            )

    def test_weekly_kind_valid(self) -> None:
        update = TimeOffEntryUpdate(entry_kind="weekly", weekday=5)
        assert update.weekday == 5

    def test_weekly_kind_without_weekday_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekday must be provided"):
            TimeOffEntryUpdate(entry_kind="weekly")

    def test_weekly_kind_weekday_out_of_range_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekday must be provided"):
            TimeOffEntryUpdate(entry_kind="weekly", weekday=0)

    def test_update_entry_type_only_is_valid(self) -> None:
        """Updating only entry_type without touching shape fields is valid."""
        update = TimeOffEntryUpdate(entry_type="business")
        assert update.entry_type == "business"

    def test_update_entry_flag_only_is_valid(self) -> None:
        """Updating only entry_flag without touching shape fields is valid."""
        update = TimeOffEntryUpdate(entry_flag="half_am")
        assert update.entry_flag == "half_am"


# ---------------------------------------------------------------------------
# TimeOffEntrySyncCreateItem shape validator
# ---------------------------------------------------------------------------


class TestTimeOffEntrySyncCreateItem:
    """TimeOffEntrySyncCreateItem must enforce shape constraints like TimeOffEntryCreate."""

    def _base(self, **kwargs) -> dict:
        return {
            "id": "entry-001",
            "action": "create",
            "client_updated_at": _NOW.isoformat(),
            **kwargs,
        }

    def test_create_date_entry_valid(self) -> None:
        item = TimeOffEntrySyncCreateItem(**self._base(entry_kind="date", date="2026-07-14"))
        assert item.entry_kind == "date"

    def test_create_range_entry_valid(self) -> None:
        item = TimeOffEntrySyncCreateItem(
            **self._base(
                entry_kind="range",
                start_date="2026-08-01",
                end_date="2026-08-05",
            )
        )
        assert item.entry_kind == "range"

    def test_create_weekly_entry_valid(self) -> None:
        item = TimeOffEntrySyncCreateItem(**self._base(entry_kind="weekly", weekday=3))
        assert item.weekday == 3

    def test_create_date_entry_missing_date_raises(self) -> None:
        with pytest.raises(ValidationError, match="date is required"):
            TimeOffEntrySyncCreateItem(**self._base(entry_kind="date"))

    def test_create_range_missing_end_raises(self) -> None:
        with pytest.raises(ValidationError, match="start_date and end_date are required"):
            TimeOffEntrySyncCreateItem(**self._base(entry_kind="range", start_date="2026-08-01"))

    def test_create_range_end_before_start_raises(self) -> None:
        with pytest.raises(ValidationError, match="end_date cannot be earlier than start_date"):
            TimeOffEntrySyncCreateItem(
                **self._base(
                    entry_kind="range",
                    start_date="2026-08-10",
                    end_date="2026-08-01",
                )
            )

    def test_create_weekly_weekday_out_of_range_raises(self) -> None:
        with pytest.raises(ValidationError, match="weekday must be between 1 and 7"):
            TimeOffEntrySyncCreateItem(**self._base(entry_kind="weekly", weekday=8))

    def test_create_id_cannot_be_empty(self) -> None:
        with pytest.raises(ValidationError):
            TimeOffEntrySyncCreateItem(
                id="",
                action="create",
                client_updated_at=_NOW,
                entry_kind="date",
                date=date(2026, 7, 1),
            )

    def test_create_applies_type_defaults(self) -> None:
        item = TimeOffEntrySyncCreateItem(**self._base(entry_kind="date", date="2026-07-14"))
        assert item.entry_type == "vacation"
        assert item.entry_flag == "full_day"


# ---------------------------------------------------------------------------
# TimeOffEntrySyncUpdateItem shape validator
# ---------------------------------------------------------------------------


class TestTimeOffEntrySyncUpdateItem:
    """TimeOffEntrySyncUpdateItem: explicit null for non-nullable fields is rejected."""

    def _base(self, **kwargs) -> dict:
        return {
            "id": "entry-002",
            "action": "update",
            "client_updated_at": _NOW.isoformat(),
            **kwargs,
        }

    def test_update_note_only_is_valid(self) -> None:
        item = TimeOffEntrySyncUpdateItem(**self._base(note="new note"))
        assert item.note == "new note"

    def test_update_entry_kind_date_valid(self) -> None:
        item = TimeOffEntrySyncUpdateItem(**self._base(entry_kind="date", date="2026-09-01"))
        assert item.entry_kind == "date"

    def test_update_entry_kind_range_valid(self) -> None:
        item = TimeOffEntrySyncUpdateItem(
            **self._base(
                entry_kind="range",
                start_date="2026-09-01",
                end_date="2026-09-05",
            )
        )
        assert item.entry_kind == "range"

    def test_update_explicit_null_entry_kind_raises(self) -> None:
        """Explicitly passing entry_kind=null (null in JSON) must be rejected."""
        with pytest.raises(ValidationError, match="entry_kind cannot be null"):
            TimeOffEntrySyncUpdateItem(**self._base(entry_kind=None))

    def test_update_explicit_null_entry_type_raises(self) -> None:
        with pytest.raises(ValidationError, match="entry_type cannot be null"):
            TimeOffEntrySyncUpdateItem(**self._base(entry_type=None))

    def test_update_explicit_null_entry_flag_raises(self) -> None:
        with pytest.raises(ValidationError, match="entry_flag cannot be null"):
            TimeOffEntrySyncUpdateItem(**self._base(entry_flag=None))

    def test_update_without_kind_but_with_shape_fields_allows_partial(self) -> None:
        """Shape fields without entry_kind should not raise when require_kind=False."""
        # Per the _validate_time_off_shape logic, no entry_kind AND shape fields
        # without require_kind=True should pass validation.
        item = TimeOffEntrySyncUpdateItem(**self._base(note="just a note"))
        assert item.entry_kind is None

    def test_update_weekly_kind_valid_weekday(self) -> None:
        item = TimeOffEntrySyncUpdateItem(**self._base(entry_kind="weekly", weekday=7))
        assert item.weekday == 7

    def test_update_range_end_before_start_raises(self) -> None:
        with pytest.raises(ValidationError, match="end_date cannot be earlier than start_date"):
            TimeOffEntrySyncUpdateItem(
                **self._base(
                    entry_kind="range",
                    start_date="2026-09-10",
                    end_date="2026-09-01",
                )
            )


# ---------------------------------------------------------------------------
# TimeOffEntrySyncDeleteItem
# ---------------------------------------------------------------------------


class TestTimeOffEntrySyncDeleteItem:
    """TimeOffEntrySyncDeleteItem has no shape constraints; requires only id + action."""

    def test_delete_item_valid(self) -> None:
        item = TimeOffEntrySyncDeleteItem(
            id="entry-del-1",
            action="delete",
            client_updated_at=_NOW,
        )
        assert item.action == "delete"

    def test_delete_item_empty_id_raises(self) -> None:
        with pytest.raises(ValidationError):
            TimeOffEntrySyncDeleteItem(id="", action="delete", client_updated_at=_NOW)


# ---------------------------------------------------------------------------
# UserRegister field constraints (new schema in this PR)
# ---------------------------------------------------------------------------


class TestUserRegister:
    """UserRegister enforces username length and password minimum length."""

    def test_valid_registration_payload(self) -> None:
        reg = UserRegister(username="alice", password="securepass123")
        assert reg.username == "alice"
        assert reg.display_name is None

    def test_display_name_optional(self) -> None:
        reg = UserRegister(username="bob", password="securepass123", display_name="Bob Smith")
        assert reg.display_name == "Bob Smith"

    def test_empty_username_rejected(self) -> None:
        with pytest.raises(ValidationError):
            UserRegister(username="", password="securepass123")

    def test_username_max_length_boundary(self) -> None:
        """Username of exactly 150 chars should be accepted."""
        reg = UserRegister(username="x" * 150, password="securepass123")
        assert len(reg.username) == 150

    def test_username_over_max_length_rejected(self) -> None:
        with pytest.raises(ValidationError):
            UserRegister(username="x" * 151, password="securepass123")

    def test_password_minimum_8_chars(self) -> None:
        """Password of exactly 8 chars should be accepted."""
        reg = UserRegister(username="charlie", password="12345678")
        assert reg.password == "12345678"

    def test_password_too_short_rejected(self) -> None:
        with pytest.raises(ValidationError):
            UserRegister(username="charlie", password="short")

    def test_password_7_chars_rejected(self) -> None:
        """Boundary: 7-char password is one below the minimum and must be rejected."""
        with pytest.raises(ValidationError):
            UserRegister(username="charlie", password="1234567")


# ---------------------------------------------------------------------------
# AccountCapabilities / AccountProfile structure (new schemas in this PR)
# ---------------------------------------------------------------------------


class TestAccountSchemas:
    """AccountCapabilities and AccountProfile are straightforward response schemas."""

    def test_account_capabilities_backup_enabled(self) -> None:
        caps = AccountCapabilities(backup_enabled=True)
        assert caps.backup_enabled is True

    def test_account_capabilities_backup_disabled(self) -> None:
        caps = AccountCapabilities(backup_enabled=False)
        assert caps.backup_enabled is False

    def test_account_profile_structure(self) -> None:
        profile = AccountProfile(
            id=42,
            username="alice",
            display_name="Alice",
            is_admin=False,
            capabilities=AccountCapabilities(backup_enabled=True),
        )
        assert profile.id == 42
        assert profile.username == "alice"
        assert profile.capabilities.backup_enabled is True

    def test_account_profile_admin_flag(self) -> None:
        profile = AccountProfile(
            id=1,
            username="admin",
            display_name="Admin",
            is_admin=True,
            capabilities=AccountCapabilities(backup_enabled=True),
        )
        assert profile.is_admin is True

    def test_account_profile_missing_capabilities_raises(self) -> None:
        with pytest.raises(ValidationError):
            AccountProfile(id=1, username="u", display_name="U", is_admin=False)