"""Tests for .hday Pydantic models."""

import pytest
from pydantic import ValidationError

from app.models.hday import (
    HdayConflictResponse,
    HdayEvent,
    HdayReadResponse,
    HdayWriteRequest,
    HdayWriteResponse,
)


class TestHdayEvent:
    """Tests for HdayEvent model."""

    def test_range_event_creation(self):
        """Test creating a range event."""
        event = HdayEvent(
            type="range",
            start="2025/01/15",
            end="2025/01/20",
            flags=["holiday"],
            title="Vacation",
            raw="2025/01/15-2025/01/20 # Vacation",
        )

        assert event.type == "range"
        assert event.start == "2025/01/15"
        assert event.end == "2025/01/20"
        assert event.flags == ["holiday"]
        assert event.title == "Vacation"
        assert event.raw == "2025/01/15-2025/01/20 # Vacation"
        assert event.weekday is None

    def test_weekly_event_creation(self):
        """Test creating a weekly event."""
        event = HdayEvent(
            type="weekly",
            weekday=1,
            flags=["in", "half_am"],
            title="Monday in office",
            raw="d1ka # Monday in office",
        )

        assert event.type == "weekly"
        assert event.weekday == 1
        assert event.flags == ["in", "half_am"]
        assert event.title == "Monday in office"
        assert event.raw == "d1ka # Monday in office"
        assert event.start is None
        assert event.end is None

    def test_unknown_event_creation(self):
        """Test creating an unknown event."""
        event = HdayEvent(
            type="unknown", flags=["holiday"], raw="some unknown line"
        )

        assert event.type == "unknown"
        assert event.flags == ["holiday"]
        assert event.raw == "some unknown line"
        assert event.start is None
        assert event.end is None
        assert event.weekday is None

    def test_default_values(self):
        """Test default field values."""
        event = HdayEvent(type="range", start="2025/01/15")

        assert event.end is None
        assert event.weekday is None
        assert event.flags == []
        assert event.title == ""
        assert event.raw == ""

    def test_invalid_type(self):
        """Test that invalid type raises validation error."""
        with pytest.raises(ValidationError):
            HdayEvent(type="invalid_type")

    def test_valid_flags(self):
        """Test all valid flag types."""
        valid_flags = [
            "half_am",
            "half_pm",
            "business",
            "weekend",
            "birthday",
            "ill",
            "in",
            "course",
            "other",
            "onsite",
            "no_fly",
            "can_fly",
            "holiday",
        ]

        event = HdayEvent(type="range", start="2025/01/15", flags=valid_flags)
        assert event.flags == valid_flags


class TestHdayReadResponse:
    """Tests for HdayReadResponse model."""

    def test_creation(self):
        """Test creating a read response."""
        response = HdayReadResponse(
            username="testuser",
            raw="2025/01/15 # Vacation",
            etag="sha256:abcd1234",
        )

        assert response.username == "testuser"
        assert response.raw == "2025/01/15 # Vacation"
        assert response.etag == "sha256:abcd1234"

    def test_required_fields(self):
        """Test that all fields are required."""
        with pytest.raises(ValidationError):
            HdayReadResponse(username="testuser", raw="content")

        with pytest.raises(ValidationError):
            HdayReadResponse(username="testuser", etag="sha256:abc")

        with pytest.raises(ValidationError):
            HdayReadResponse(raw="content", etag="sha256:abc")


class TestHdayWriteRequest:
    """Tests for HdayWriteRequest model."""

    def test_creation_with_raw(self):
        """Test creating a write request with raw content."""
        request = HdayWriteRequest(
            raw="2025/01/15 # Vacation", etag="sha256:abcd1234"
        )

        assert request.raw == "2025/01/15 # Vacation"
        assert request.events is None
        assert request.etag == "sha256:abcd1234"

    def test_creation_with_events(self):
        """Test creating a write request with events."""
        events = [
            HdayEvent(
                type="range", start="2025/01/15", end="2025/01/15", flags=["holiday"]
            )
        ]
        request = HdayWriteRequest(events=events, etag="sha256:abcd1234")

        assert request.events == events
        assert request.raw is None
        assert request.etag == "sha256:abcd1234"

    def test_creation_with_null_etag(self):
        """Test creating a write request for new file (null etag)."""
        request = HdayWriteRequest(raw="2025/01/15 # Vacation", etag=None)

        assert request.raw == "2025/01/15 # Vacation"
        assert request.etag is None

    def test_all_optional_fields(self):
        """Test that all fields are optional."""
        request = HdayWriteRequest()

        assert request.raw is None
        assert request.events is None
        assert request.etag is None


class TestHdayWriteResponse:
    """Tests for HdayWriteResponse model."""

    def test_creation(self):
        """Test creating a write response."""
        response = HdayWriteResponse(etag="sha256:newetag")

        assert response.etag == "sha256:newetag"

    def test_required_etag(self):
        """Test that etag is required."""
        with pytest.raises(ValidationError):
            HdayWriteResponse()


class TestHdayConflictResponse:
    """Tests for HdayConflictResponse model."""

    def test_creation(self):
        """Test creating a conflict response."""
        events = [
            HdayEvent(
                type="range", start="2025/01/15", end="2025/01/15", flags=["holiday"]
            )
        ]
        response = HdayConflictResponse(
            raw="2025/01/15 # Vacation", events=events, etag="sha256:current"
        )

        assert response.raw == "2025/01/15 # Vacation"
        assert response.events == events
        assert response.etag == "sha256:current"

    def test_required_fields(self):
        """Test that all fields are required."""
        events = [
            HdayEvent(
                type="range", start="2025/01/15", end="2025/01/15", flags=["holiday"]
            )
        ]

        with pytest.raises(ValidationError):
            HdayConflictResponse(raw="content", events=events)

        with pytest.raises(ValidationError):
            HdayConflictResponse(raw="content", etag="sha256:abc")

        with pytest.raises(ValidationError):
            HdayConflictResponse(events=events, etag="sha256:abc")
