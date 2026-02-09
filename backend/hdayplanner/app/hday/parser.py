import logging
import re
from typing import List
from .models import HdayEvent

logger = logging.getLogger(__name__)

PREFIX_MAP = {'a': 'half_am', 'p': 'half_pm', 'b': 'business', 'e': 'weekend', 'h': 'birthday', 'i': 'ill', 'k': 'in', 's': 'course', 'u': 'other', 'w': 'onsite', 'n': 'no_fly', 'f': 'can_fly'}
REV_MAP = {v:k for k,v in PREFIX_MAP.items()}

# Type flags that determine event category (mutually exclusive)
TYPE_FLAGS = ('business', 'weekend', 'birthday', 'ill', 'in', 'course', 'other')

RE_RANGE  = re.compile(r'^(?P<prefix>[a-z]*)?(?P<start>\d{4}/\d{2}/\d{2})(?:-(?P<end>\d{4}/\d{2}/\d{2}))?(?:\s*#\s*(?P<title>.*))?$', re.I)
RE_WEEKLY = re.compile(r'^d(?P<weekday>[1-7])(?P<suffix>[a-z]*?)(?:\s*#\s*(?P<title>.*))?$', re.I)

def normalize_flags(flags: List[str]) -> List[str]:
    """
    Enforce mutual exclusivity of time/location flags and type flags.
    Only keeps the first flag found in each category.
    """
    normalized = list(flags)

    # Enforce mutual exclusivity of time/location flags
    time_location_flags = ['half_am', 'half_pm', 'onsite', 'no_fly', 'can_fly']
    found_time_location = [f for f in normalized if f in time_location_flags]

    if len(found_time_location) > 1:
        first_flag = found_time_location[0]
        normalized = [f for f in normalized if f not in time_location_flags or f == first_flag]
        logger.warning(f"Multiple time/location flags found ({', '.join(found_time_location)}). Keeping only: {first_flag}")

    # Enforce mutual exclusivity of type flags
    type_flags = list(TYPE_FLAGS)
    found_types = [f for f in normalized if f in type_flags]

    if len(found_types) > 1:
        first_type = found_types[0]
        normalized = [f for f in normalized if f not in type_flags or f == first_type]
        logger.warning(f"Multiple type flags found ({', '.join(found_types)}). Keeping only: {first_type}")

    return normalized


def parse_text(text: str) -> List[HdayEvent]:
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    events: List[HdayEvent] = []
    for ln in lines:
        m = RE_RANGE.match(ln)
        if m:
            g = m.groupdict()
            prefix = g['prefix'] or ''
            flags = [PREFIX_MAP.get(ch, f'flag_{ch}') for ch in prefix]
            flags = normalize_flags(flags)
            if not any(f in TYPE_FLAGS for f in flags):
                flags.append('holiday')
            events.append(HdayEvent(
                type='range', start=g['start'], end=g['end'] or g['start'],
                flags=flags, title=(g['title'] or '').strip(), raw=ln
            ))
            continue
        w = RE_WEEKLY.match(ln)
        if w:
            g = w.groupdict()
            suffix = g['suffix'] or ''
            flags = [PREFIX_MAP.get(ch, f'flag_{ch}') for ch in suffix]
            flags = normalize_flags(flags)
            if not any(f in TYPE_FLAGS for f in flags):
                flags.append('holiday')
            events.append(HdayEvent(
                type='weekly', weekday=int(g['weekday']),
                flags=flags, title=(g['title'] or '').strip(), raw=ln
            ))
            continue
        events.append(HdayEvent(type='unknown', raw=ln, flags=['holiday']))
    return events


def to_text(events: List[HdayEvent]) -> str:
    out_lines: List[str] = []
    for ev in events:
        # Preserve the original order of flags from input (FIFO), don't reorder
        # Filter out 'holiday' which is not in REV_MAP and shouldn't be serialized
        flags = ev.flags or []
        pref = ''.join(REV_MAP.get(f, '') for f in flags if f in REV_MAP)

        if ev.type == 'range':
            title = f" # {ev.title}" if ev.title else ''
            out_lines.append(f"{pref}{ev.start}-{ev.end}{title}")
        elif ev.type == 'weekly':
            title = f" # {ev.title}" if ev.title else ''
            out_lines.append(f"d{ev.weekday}{pref}{title}")
        else:
            out_lines.append(ev.raw or '')
    return '\n'.join(out_lines)
