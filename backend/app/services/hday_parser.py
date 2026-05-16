"""Parser for .hday file format.

This module provides parsing and serialization functionality for .hday files,
which are human-readable text files for managing time-off events.
"""

import logging
import re

from app.models.hday import Flag, HdayEvent

logger = logging.getLogger(__name__)

# Character to flag mapping
PREFIX_MAP: dict[str, Flag] = {
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

# Reverse mapping for serialization
REV_MAP = {v: k for k, v in PREFIX_MAP.items()}

# Type flags that determine event category (mutually exclusive)
TYPE_FLAGS: tuple[Flag, ...] = (
    "business",
    "weekend",
    "birthday",
    "ill",
    "in",
    "course",
    "other",
)

# Regex patterns for parsing
RE_RANGE = re.compile(
    r"^(?P<prefix>[a-z]*)?(?P<start>\d{4}/\d{1,2}/\d{1,2})(?:-(?P<end>\d{4}/\d{1,2}/\d{1,2}))?(?:\s+r(?P<replacement>[^#]*))?(?:[^#]*#(?P<comment>.*))?$",
    re.I,
)
RE_WEEKLY = re.compile(
    r"^d(?P<weekday>[1-7])(?P<suffix>[a-z]*)(?:[^#]*#(?P<comment>.*))?$", re.I
)




def normalize_hday_date(value: str) -> str:
    """Normalize hday dates to YYYY/MM/DD while preserving already-normalized values."""
    match = re.match(r"^(\d{4})/(\d{1,2})/(\d{1,2})$", value)
    if not match:
        return value

    year, month, day = match.groups()
    return f"{year}/{month.zfill(2)}/{day.zfill(2)}"


def normalize_flags(flags: list[Flag]) -> list[Flag]:
    """Enforce mutual exclusivity of time/location flags and type flags.
    
    Only keeps the first flag found in each category.
    
    Args:
        flags: List of flag strings to normalize
        
    Returns:
        Normalized list with mutual exclusivity enforced
    """
    normalized: list[Flag] = list(flags)

    # Enforce mutual exclusivity of time/location flags
    time_location_flags = ["half_am", "half_pm", "onsite", "no_fly", "can_fly"]
    found_time_location = [f for f in normalized if f in time_location_flags]

    if len(found_time_location) > 1:
        first_flag = found_time_location[0]
        normalized = [
            f for f in normalized if f not in time_location_flags or f == first_flag
        ]
        logger.warning(
            f"Multiple time/location flags found ({', '.join(found_time_location)}). "
            f"Keeping only: {first_flag}"
        )

    # Enforce mutual exclusivity of type flags
    type_flags = list(TYPE_FLAGS)
    found_types = [f for f in normalized if f in type_flags]

    if len(found_types) > 1:
        first_type = found_types[0]
        normalized = [f for f in normalized if f not in type_flags or f == first_type]
        logger.warning(
            f"Multiple type flags found ({', '.join(found_types)}). "
            f"Keeping only: {first_type}"
        )

    return normalized


def parse_text(text: str) -> list[HdayEvent]:
    """Parse .hday file content into a list of events.
    
    Supported formats:
    - Range events: [flags]YYYY/MM/DD[-YYYY/MM/DD] [# comment]
    - Weekly events: dN[flags] [# comment] where N is 1-7 (ISO weekday)
    
    Unknown lines are preserved as 'unknown' type events.
    
    Args:
        text: Raw .hday file content
        
    Returns:
        List of parsed HdayEvent objects
    """
    lines = text.splitlines()
    events: list[HdayEvent] = []

    for original_line in lines:
        # Preserve original line for raw field, use trimmed for parsing
        ln = original_line.strip()
        if not ln:
            # Skip blank lines entirely
            continue
        # Try to match range event
        m = RE_RANGE.match(ln)
        if m:
            g = m.groupdict()
            prefix = g["prefix"] or ""
            # Only keep known flags, ignore unknown characters
            flags = [PREFIX_MAP[ch.lower()] for ch in prefix if ch.lower() in PREFIX_MAP]
            flags = normalize_flags(flags)
            if not any(f in TYPE_FLAGS for f in flags):
                flags.append("holiday")
            start = normalize_hday_date(g["start"])
            end = normalize_hday_date(g["end"]) if g["end"] else start
            title = (g.get("comment") or g.get("replacement") or "").strip()
            events.append(
                HdayEvent(
                    type="range",
                    start=start,
                    end=end,
                    flags=flags,
                    title=title,
                    raw=original_line,
                )
            )
            continue

        # Try to match weekly event
        w = RE_WEEKLY.match(ln)
        if w:
            g = w.groupdict()
            suffix = g["suffix"] or ""
            # Only keep known flags, ignore unknown characters
            flags = [PREFIX_MAP[ch.lower()] for ch in suffix if ch.lower() in PREFIX_MAP]
            flags = normalize_flags(flags)
            if not any(f in TYPE_FLAGS for f in flags):
                flags.append("holiday")
            events.append(
                HdayEvent(
                    type="weekly",
                    weekday=int(g["weekday"]),
                    flags=flags,
                    title=(g["comment"] or "").strip(),
                    raw=original_line,
                )
            )
            continue

        # Unknown line - preserve as-is
        events.append(HdayEvent(type="unknown", raw=original_line, flags=["holiday"]))

    return events


def to_text(events: list[HdayEvent]) -> str:
    """Serialize a list of events to .hday format.
    
    Args:
        events: List of HdayEvent objects to serialize
        
    Returns:
        .hday formatted text
    """
    out_lines: list[str] = []

    for ev in events:
        # Preserve the original order of flags from input (FIFO), don't reorder
        # Filter out 'holiday' which is not in REV_MAP and shouldn't be serialized
        flags = ev.flags or []
        pref = "".join(REV_MAP.get(f, "") for f in flags if f in REV_MAP)

        if ev.type == "range":
            title = f" # {ev.title}" if ev.title else ""
            # Default end to start if it is missing to avoid emitting '-None'
            end = ev.end or ev.start
            out_lines.append(f"{pref}{ev.start}-{end}{title}")
        elif ev.type == "weekly":
            title = f" # {ev.title}" if ev.title else ""
            out_lines.append(f"d{ev.weekday}{pref}{title}")
        else:
            # Unknown type - use raw line
            out_lines.append(ev.raw or "")

    return "\n".join(out_lines)
