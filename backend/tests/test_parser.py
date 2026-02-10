"""Tests for .hday parser."""

from app.models.hday import HdayEvent
from app.services.hday_parser import (
    PREFIX_MAP,
    REV_MAP,
    normalize_flags,
    parse_text,
    to_text,
)


class TestPrefixMap:
    """Tests for PREFIX_MAP and REV_MAP."""

    def test_prefix_map_completeness(self):
        """Test that PREFIX_MAP contains all expected flags."""
        expected_flags = {
            "a": "half_am",
            "p": "half_pm",
            "b": "business",
            "e": "weekend",
            "h": "birthday",
            "i": "ill",
            "k": "in",
            "s": "course",
            "u": "other",
            "w": "onsite",
            "n": "no_fly",
            "f": "can_fly",
        }
        assert PREFIX_MAP == expected_flags

    def test_reverse_map_symmetry(self):
        """Test that REV_MAP is the reverse of PREFIX_MAP."""
        assert len(REV_MAP) == len(PREFIX_MAP)
        for char, flag in PREFIX_MAP.items():
            assert REV_MAP[flag] == char


class TestNormalizeFlags:
    """Tests for normalize_flags function."""

    def test_no_normalization_needed(self):
        """Test flags that don't need normalization."""
        flags = ["business", "half_am"]
        result = normalize_flags(flags)
        assert result == ["business", "half_am"]

    def test_multiple_time_location_flags(self):
        """Test that only first time/location flag is kept."""
        flags = ["half_am", "half_pm", "business"]
        result = normalize_flags(flags)
        assert result == ["half_am", "business"]

    def test_multiple_type_flags(self):
        """Test that only first type flag is kept."""
        flags = ["business", "in", "half_am"]
        result = normalize_flags(flags)
        assert result == ["business", "half_am"]

    def test_multiple_violations(self):
        """Test normalization with multiple violations."""
        flags = ["half_am", "business", "half_pm", "in"]
        result = normalize_flags(flags)
        # Should keep first time/location (half_am) and first type (business)
        assert result == ["half_am", "business"]

    def test_empty_flags(self):
        """Test empty flags list."""
        result = normalize_flags([])
        assert result == []


class TestParseText:
    """Tests for parse_text function."""

    def test_parse_single_range_event(self):
        """Test parsing a single range event."""
        text = "2025/01/15 # Vacation day"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].type == "range"
        assert events[0].start == "2025/01/15"
        assert events[0].end == "2025/01/15"
        assert events[0].title == "Vacation day"
        assert events[0].flags == ["holiday"]
        assert events[0].raw == "2025/01/15 # Vacation day"

    def test_parse_range_with_end_date(self):
        """Test parsing a range event with different start and end dates."""
        text = "2025/12/23-2025/12/27 # Christmas vacation"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].type == "range"
        assert events[0].start == "2025/12/23"
        assert events[0].end == "2025/12/27"
        assert events[0].title == "Christmas vacation"

    def test_parse_range_with_prefix_flags(self):
        """Test parsing a range event with prefix flags."""
        text = "b2025/03/10-2025/03/14 # Business trip"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].type == "range"
        assert events[0].flags == ["business"]
        assert events[0].title == "Business trip"

    def test_parse_range_multiple_flags(self):
        """Test parsing a range event with multiple flags."""
        text = "ba2025/03/10 # Business AM"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].flags == ["business", "half_am"]

    def test_parse_weekly_event(self):
        """Test parsing a weekly event."""
        text = "d1 # Every Monday"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].type == "weekly"
        assert events[0].weekday == 1
        assert events[0].flags == ["holiday"]
        assert events[0].title == "Every Monday"

    def test_parse_weekly_with_suffix_flags(self):
        """Test parsing a weekly event with suffix flags."""
        text = "d5k # Friday in office"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].type == "weekly"
        assert events[0].weekday == 5
        assert events[0].flags == ["in"]
        assert events[0].title == "Friday in office"

    def test_parse_weekly_multiple_flags(self):
        """Test parsing a weekly event with multiple flags."""
        text = "d1ka # Monday in office AM"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].weekday == 1
        assert events[0].flags == ["in", "half_am"]

    def test_parse_unknown_line(self):
        """Test that unknown lines are preserved."""
        text = "some random text"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].type == "unknown"
        assert events[0].raw == "some random text"
        assert events[0].flags == ["holiday"]

    def test_parse_multiple_events(self):
        """Test parsing multiple events."""
        text = """
2025/01/15 # Vacation
d1k # Monday in office
b2025/03/10-2025/03/14 # Business trip
        """
        events = parse_text(text)

        assert len(events) == 3
        assert events[0].type == "range"
        assert events[1].type == "weekly"
        assert events[2].type == "range"
        assert events[2].flags == ["business"]

    def test_parse_empty_text(self):
        """Test parsing empty text."""
        events = parse_text("")
        assert events == []

    def test_parse_whitespace_only(self):
        """Test parsing whitespace-only text."""
        events = parse_text("   \n  \n  ")
        assert events == []

    def test_parse_no_title(self):
        """Test parsing events without titles."""
        text = "2025/01/15"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].title == ""

    def test_parse_case_insensitive(self):
        """Test that parsing is case insensitive."""
        text = "B2025/01/15 # Business"
        events = parse_text(text)

        assert len(events) == 1
        assert events[0].flags == ["business"]


class TestToText:
    """Tests for to_text function."""

    def test_serialize_range_event(self):
        """Test serializing a range event."""
        events = [
            HdayEvent(
                type="range",
                start="2025/01/15",
                end="2025/01/20",
                flags=["holiday"],
                title="Vacation",
            )
        ]
        result = to_text(events)

        assert result == "2025/01/15-2025/01/20 # Vacation"

    def test_serialize_range_with_flags(self):
        """Test serializing a range event with flags."""
        events = [
            HdayEvent(
                type="range",
                start="2025/03/10",
                end="2025/03/14",
                flags=["business", "half_am"],
                title="Business trip",
            )
        ]
        result = to_text(events)

        assert result == "ba2025/03/10-2025/03/14 # Business trip"

    def test_serialize_range_no_title(self):
        """Test serializing a range event without title."""
        events = [
            HdayEvent(
                type="range", start="2025/01/15", end="2025/01/15", flags=["holiday"]
            )
        ]
        result = to_text(events)

        assert result == "2025/01/15-2025/01/15"

    def test_serialize_weekly_event(self):
        """Test serializing a weekly event."""
        events = [
            HdayEvent(
                type="weekly", weekday=1, flags=["holiday"], title="Every Monday"
            )
        ]
        result = to_text(events)

        assert result == "d1 # Every Monday"

    def test_serialize_weekly_with_flags(self):
        """Test serializing a weekly event with flags."""
        events = [
            HdayEvent(
                type="weekly",
                weekday=5,
                flags=["in", "half_am"],
                title="Friday in office AM",
            )
        ]
        result = to_text(events)

        assert result == "d5ka # Friday in office AM"

    def test_serialize_unknown_event(self):
        """Test serializing an unknown event."""
        events = [HdayEvent(type="unknown", raw="some random text", flags=["holiday"])]
        result = to_text(events)

        assert result == "some random text"

    def test_serialize_multiple_events(self):
        """Test serializing multiple events."""
        events = [
            HdayEvent(
                type="range",
                start="2025/01/15",
                end="2025/01/15",
                flags=["holiday"],
                title="Vacation",
            ),
            HdayEvent(
                type="weekly", weekday=1, flags=["in"], title="Monday in office"
            ),
            HdayEvent(
                type="range",
                start="2025/03/10",
                end="2025/03/14",
                flags=["business"],
                title="Business trip",
            ),
        ]
        result = to_text(events)

        expected = "\n".join(
            [
                "2025/01/15-2025/01/15 # Vacation",
                "d1k # Monday in office",
                "b2025/03/10-2025/03/14 # Business trip",
            ]
        )
        assert result == expected

    def test_serialize_empty_list(self):
        """Test serializing an empty list."""
        result = to_text([])
        assert result == ""

    def test_holiday_flag_not_serialized(self):
        """Test that 'holiday' flag is not serialized."""
        events = [
            HdayEvent(
                type="range", start="2025/01/15", end="2025/01/15", flags=["holiday"]
            )
        ]
        result = to_text(events)

        # Should not have any flag prefix
        assert result == "2025/01/15-2025/01/15"

    def test_flag_order_preserved(self):
        """Test that flag order is preserved (FIFO)."""
        events = [
            HdayEvent(
                type="range",
                start="2025/01/15",
                end="2025/01/15",
                flags=["business", "half_am", "onsite"],
            )
        ]
        result = to_text(events)

        # Flags should appear in order: b, a, w
        assert result.startswith("baw")


class TestRoundTrip:
    """Tests for round-trip parsing and serialization."""

    def test_round_trip_single_range(self):
        """Test round-trip for single range event."""
        original = "2025/01/15-2025/01/20 # Vacation"
        events = parse_text(original)
        result = to_text(events)

        assert result == original

    def test_round_trip_weekly(self):
        """Test round-trip for weekly event."""
        original = "d1k # Monday in office"
        events = parse_text(original)
        result = to_text(events)

        assert result == original

    def test_round_trip_complex(self):
        """Test round-trip for complex .hday file."""
        original = "\n".join(
            [
                "2025/01/15-2025/01/20 # Vacation",
                "d1k # Monday in office",
                "ba2025/03/10-2025/03/14 # Business trip AM",
                "d5 # Every Friday",
            ]
        )
        events = parse_text(original)
        result = to_text(events)

        assert result == original

    def test_round_trip_unknown_preserved(self):
        """Test that unknown lines are preserved in round-trip."""
        original = "some random text"
        events = parse_text(original)
        result = to_text(events)

        assert result == original
