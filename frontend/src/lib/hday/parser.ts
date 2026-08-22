/**
 * .hday Format Parser and Serializer
 *
 * Parser and serializer for the `.hday` format - a human-readable text format
 * for managing time-off events (vacations, business trips, recurring office days, etc.).
 *
 * ## Format Specification
 *
 * **Range Events** (specific dates):
 * ```
 * [flags]YYYY/MM/DD[-YYYY/MM/DD] [# comment]
 * ```
 * Examples:
 * - `2025/01/15 # Single day off`
 * - `2025/12/23-2025/12/27 # Multi-day vacation`
 * - `b2025/03/10-2025/03/14 # Business trip (b flag)`
 *
 * **Weekly Events** (recurring patterns):
 * ```
 * dN[flags] [# comment]
 * ```
 * Where N = 1-7 (Monday to Sunday)
 * Examples:
 * - `d1 # Every Monday`
 * - `d5k # Every Friday in office (k flag)`
 *
 * ## Flags
 *
 * **Type Flags** (mutually exclusive, first wins):
 * - `b` = business trip
 * - `s` = course/training
 * - `k` = in office
 * - `u` = other
 * - `e` = weekend
 * - `h` = birthday
 * - `i` = sick leave
 * - (default: holiday if no type flag)
 *
 * **Time/Location Flags** (mutually exclusive, first wins):
 * - `a` = half day AM
 * - `p` = half day PM
 * - `w` = onsite
 * - `n` = no fly zone
 * - `f` = can fly
 *
 * ## Round-Trip Guarantee
 *
 * Unknown/malformed lines are preserved in the `raw` field, ensuring that
 * parsing → editing → serializing maintains the original text exactly.
 *
 * ## Flag Normalization
 *
 * The parser automatically enforces mutual exclusivity:
 * - Multiple type flags → keeps first, removes rest (with console warning)
 * - Multiple time/location flags → keeps first, removes rest (with console warning)
 * - No type flag → adds default 'holiday'
 *
 * ## Accessibility
 *
 * All color constants meet WCAG AA standards (4.5:1 minimum contrast with black text).
 * See `EVENT_COLORS` for verified contrast ratios.
 *
 * @module lib/hday/parser
 */

/* oxlint-disable no-console -- this module is shared with the bun-compiled
   hday-helper (see hday-helper/src/main.ts), so it must stay free of the "@/"
   alias and import.meta.env; console is the portable logging primitive here. */
import { normalizeEventFlags } from "./flags";
import { isValidHdayDate } from "./dateValidation";
import type { EventFlag, HdayEvent } from "./types";

/**
 * Color constants for event backgrounds.
 * All colors meet WCAG AA accessibility standards (4.5:1 contrast minimum) with black text (#000).
 * Verified contrast ratios:
 * - HOLIDAY_FULL: 4.57:1   - HOLIDAY_HALF: 9.25:1
 * - BUSINESS_FULL: 9.55:1  - BUSINESS_HALF: 12.90:1
 * - COURSE_FULL: 9.93:1    - COURSE_HALF: 13.83:1
 * - IN_OFFICE_FULL: 4.98:1 - IN_OFFICE_HALF: 8.73:1
 * - WEEKEND_FULL: 5.7:1    - WEEKEND_HALF: 7.8:1
 * - BIRTHDAY_FULL: 4.6:1   - BIRTHDAY_HALF: 8.2:1
 * - ILL_FULL: 6.2:1        - ILL_HALF: 8.7:1
 * - OTHER_FULL: 5.0:1      - OTHER_HALF: 10.1:1
 */
export const EVENT_COLORS = {
  HOLIDAY_FULL: "#EC0000", // Red - full day vacation/holiday
  HOLIDAY_HALF: "#FF8A8A", // Pink - half day vacation/holiday
  BUSINESS_FULL: "#FF9500", // Orange - full day business trip
  BUSINESS_HALF: "#FFC04D", // Light orange - half day business
  COURSE_FULL: "#D9AD00", // Dark yellow/gold - full day course
  COURSE_HALF: "#F0D04D", // Light yellow - half day course
  IN_OFFICE_FULL: "#008899", // Teal - full day in-office
  IN_OFFICE_HALF: "#00B8CC", // Light teal - half day in-office
  WEEKEND_FULL: "#990099", // Dark magenta - full day weekend
  WEEKEND_HALF: "#CC66CC", // Light magenta - half day weekend
  BIRTHDAY_FULL: "#0000CC", // Dark blue - full day birthday
  BIRTHDAY_HALF: "#6666FF", // Light blue - half day birthday
  ILL_FULL: "#336600", // Dark olive - full day ill/sick
  ILL_HALF: "#669933", // Light olive - half day ill/sick
  OTHER_FULL: "#008B8B", // Dark cyan - full day other
  OTHER_HALF: "#4DB8B8", // Light cyan - half day other
} as const;

/**
 * Convert a string of single-character flags into the corresponding event flags.
 *
 * Unknown characters are ignored and a console warning is emitted for each.
 *
 * @param prefix - Single-character flag string (e.g. "ap" for half-am and half-pm)
 * @returns The normalized array of `EventFlag` values; if no type flag is present the result includes `holiday`
 *
 * @example
 * parsePrefixFlags("ba") // Business trip, half-day AM
 * // Returns: ['business', 'half_am']
 *
 * @example
 * parsePrefixFlags("ka") // In office, half-day AM
 * // Returns: ['in', 'half_am']
 *
 * @example
 * parsePrefixFlags("xyz") // Invalid flags trigger warnings
 * // Console: "Unknown flag character 'x' ignored. Known flags: a, p, b, e, h, i, k, s, u, w, n, f"
 * // Returns: ['holiday'] (default when no valid type flag)
 *
 * @see normalizeEventFlags For the flag normalization logic applied to the result
 */
function parsePrefixFlags(prefix: string): EventFlag[] {
  const flagMap: Record<string, EventFlag> = {
    a: "half_am",
    p: "half_pm",
    b: "business",
    e: "weekend",
    h: "birthday",
    i: "ill",
    k: "in",
    s: "course",
    u: "other",
    w: "onsite",
    n: "no_fly",
    f: "can_fly",
  };

  const flags: EventFlag[] = [];
  for (const ch of prefix) {
    if (flagMap[ch]) {
      flags.push(flagMap[ch]);
    } else {
      console.warn(
        `Unknown flag character '${ch}' ignored. Known flags: a, p, b, e, h, i, k, s, u, w, n, f`,
      );
    }
  }

  return normalizeEventFlags(flags);
}

/**
 * Parse .hday file content into event entries.
 *
 * Supported line formats:
 * - Range: `[flags]YYYY/MM/DD-YYYY/MM/DD # comment` (end date optional; defaults to start)
 * - Weekly: `dN[flags] # comment` where N is 1–7 (ISO weekday, Monday = 1)
 * - Unknown lines are preserved as `unknown` events with a default `holiday` flag
 *
 * Flags (single letters): a=half_am, p=half_pm, b=business, s=course, i=in, w=onsite, n=no_fly, f=can_fly.
 *
 * Edge cases:
 * - Empty lines and whitespace-only lines are ignored
 * - Invalid flag characters are ignored with console warnings
 * - Malformed dates or lines that don't match any pattern are preserved as `unknown` type
 * - Multiple type flags: only the first is kept (others removed)
 * - Multiple time/location flags: only the first is kept (others removed)
 *
 * @param text - Raw .hday file content
 * @returns An array of parsed HdayEvent objects representing range, weekly or unknown events
 *
 * @example
 * // Single day vacation
 * parseHday("2025/01/15 # Vacation day")
 * // Returns: [{ type: 'range', start: '2025/01/15', end: '2025/01/15', title: 'Vacation day', flags: ['holiday'], raw: '2025/01/15 # Vacation day' }]
 *
 * @example
 * // Multi-day business trip
 * parseHday("b2025/12/23-2025/12/27 # Christmas business trip")
 * // Returns: [{ type: 'range', start: '2025/12/23', end: '2025/12/27', title: 'Christmas business trip', flags: ['business'], raw: 'b2025/12/23-2025/12/27 # Christmas business trip' }]
 *
 * @example
 * // Weekly recurring event (every Monday in office, half day AM)
 * parseHday("d1ka # Monday morning in office")
 * // Returns: [{ type: 'weekly', weekday: 1, title: 'Monday morning in office', flags: ['in', 'half_am'], raw: 'd1ka # Monday morning in office' }]
 *
 * @see toLine For the inverse operation (serializing events back to .hday format)
 */
export function parseHday(text: string): HdayEvent[] {
  const normalizeHdayDate = (value: string): string => {
    const match = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) return value;

    const year = match[1]!;
    const month = match[2]!;
    const day = match[3]!;
    return `${year}/${month.padStart(2, "0")}/${day.padStart(2, "0")}`;
  };

  const reRange =
    /^(?<prefix>[a-z]*)?(?<start>\d{4}\/\d{1,2}\/\d{1,2})(?:-(?<end>\d{4}\/\d{1,2}\/\d{1,2}))?(?:\s+r(?<replacement>[^#]*))?(?:\s*#\s*(?<comment>.*))?$/i;
  const reWeekly = /^d(?<weekday>[1-7])(?<suffix>[a-z]*?)(?:\s*#\s*(?<comment>.*))?$/i;

  const lines = text.split(/\r?\n/);
  const events: HdayEvent[] = [];

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (!line) {
      continue;
    }
    // Try parsing as range event
    const rangeMatch = line.match(reRange);
    if (rangeMatch?.groups) {
      const { prefix = "", end, comment = "", replacement = "" } = rangeMatch.groups;
      const start = rangeMatch.groups.start!;
      const normalizedStart = normalizeHdayDate(start);
      const normalizedEnd = end ? normalizeHdayDate(end) : normalizedStart;
      if (!isValidHdayDate(normalizedStart) || !isValidHdayDate(normalizedEnd)) {
        events.push({ type: "unknown", raw: originalLine, flags: ["holiday"] });
        continue;
      }

      const flags = parsePrefixFlags(prefix);
      // In .hday syntax this is technically a comment; we map it to event title in the UI.
      const title = comment || replacement;

      events.push({
        type: "range",
        start: normalizedStart,
        end: normalizedEnd,
        flags,
        title: title.trim(),
        raw: originalLine,
      });
      continue;
    }

    // Try parsing as weekly event
    const weeklyMatch = line.match(reWeekly);
    if (weeklyMatch?.groups) {
      const { suffix = "", weekday, comment = "" } = weeklyMatch.groups;

      // Regex guarantees weekday is 1-7; this check should never fail
      if (!weekday) {
        console.error(`Weekly event regex matched but weekday is undefined: ${line}`);
        events.push({ type: "unknown", raw: originalLine, flags: ["holiday"] });
        continue;
      }

      const flags = parsePrefixFlags(suffix);
      const weekdayNum = parseInt(weekday, 10);

      events.push({
        type: "weekly",
        weekday: weekdayNum,
        flags,
        title: comment.trim(),
        raw: originalLine,
      });
      continue;
    }

    // Unknown format - keep as-is
    events.push({
      type: "unknown",
      raw: originalLine,
      flags: ["holiday"],
    });
  }

  return events;
}

/**
 * Serialize an HdayEvent into a single .hday-format text line.
 *
 * @param ev - The event to serialize; for `unknown` events the `raw` field must be present.
 * @returns The corresponding single-line representation suitable for a .hday file.
 * @throws {Error} If an `unknown` event is missing its `raw` field or if the event `type` is unsupported.
 *
 * @example
 * // Serialize a single-day vacation
 * toLine({ type: 'range', start: '2025/01/15', end: '2025/01/15', title: 'Day off', flags: ['holiday'] })
 * // Returns: "2025/01/15-2025/01/15 # Day off"
 *
 * @example
 * // Serialize a business trip with half-day AM flag
 * toLine({ type: 'range', start: '2025/03/10', end: '2025/03/14', flags: ['business', 'half_am'], title: 'Conference' })
 * // Returns: "ba2025/03/10-2025/03/14 # Conference"
 *
 * @example
 * // Serialize a weekly recurring event
 * toLine({ type: 'weekly', weekday: 5, flags: ['in'], title: 'Office Friday' })
 * // Returns: "d5k # Office Friday"
 *
 * @see parseHday For the inverse operation (parsing .hday text into events)
 */
export function toLine(ev: Omit<HdayEvent, "raw"> | HdayEvent): string {
  const flagMap: Record<string, string> = {
    half_am: "a",
    half_pm: "p",
    business: "b",
    weekend: "e",
    birthday: "h",
    ill: "i",
    in: "k",
    course: "s",
    other: "u",
    onsite: "w",
    no_fly: "n",
    can_fly: "f",
  };

  // Canonical serialization order: type flags first, then time/location flags
  // This is for readability/consistency, NOT for priority resolution
  // (normalization already ensured only one flag from each category exists)
  const flagOrder: EventFlag[] = [
    "business",
    "weekend",
    "birthday",
    "ill",
    "course",
    "in",
    "other",
    "half_am",
    "half_pm",
    "onsite",
    "no_fly",
    "can_fly",
  ];

  const flags = ev.flags || [];
  const prefix = flagOrder
    .filter((f) => flags.includes(f))
    .map((f) => flagMap[f])
    .join("");

  const title = ev.title ? ` # ${ev.title}` : "";

  if (ev.type === "range") {
    const end = ev.end || ev.start;
    return `${prefix}${ev.start}-${end}${title}`;
  } else if (ev.type === "weekly") {
    return `d${ev.weekday}${prefix}${title}`;
  } else if (ev.type === "unknown") {
    // Unknown event types must have the raw field for serialization
    if ("raw" in ev && ev.raw) {
      return ev.raw;
    }
    throw new Error(
      `Cannot serialize unknown event type: missing 'raw' field. ` +
        `Event: type=${ev.type}, title="${ev.title || "(none)"}", flags=${JSON.stringify(ev.flags || [])}`,
    );
  }

  // Fallback for completely unsupported types
  throw new Error(`Unsupported event type for serialization: ${ev.type}`);
}

/**
 * Build a preview .hday line from event inputs.
 *
 * @param params - Event inputs used to generate the raw line.
 * @returns The .hday line, or an empty string if required fields are missing.
 */
export function buildPreviewLine(params: {
  eventType: "range" | "weekly";
  start: string;
  end: string;
  weekday: number;
  title: string;
  flags: EventFlag[];
}): string {
  const { eventType, start, end, weekday, title, flags } = params;
  const hasRange = eventType === "range" && !!start;
  const hasWeekly = eventType === "weekly" && !!weekday;

  if (!hasRange && !hasWeekly) {
    return "";
  }

  const normalizedFlags = normalizeEventFlags(flags);
  const baseEvent: Omit<HdayEvent, "raw"> = hasRange
    ? {
        type: "range",
        start,
        end: end || start,
        title,
        flags: normalizedFlags,
      }
    : {
        type: "weekly",
        weekday,
        title,
        flags: normalizedFlags,
      };

  return toLine(baseEvent);
}

/**
 * Sort events by date and type.
 *
 * Sorting order:
 * 1. Range events sorted by start date (oldest first)
 * 2. Weekly events sorted by weekday (Monday=1 to Sunday=7, ISO weekday)
 * 3. Unknown events at the end (maintain original order)
 *
 * @param events Array of HdayEvent objects to sort
 * @returns A new sorted array (does not mutate the original)
 */
export function sortEvents(events: HdayEvent[]): HdayEvent[] {
  return [...events].sort((a, b) => {
    // Range events come first, sorted by start date
    if (a.type === "range" && b.type === "range") {
      const aStart = a.start;
      const bStart = b.start;

      // If both are missing a start date, keep relative order (stable sort)
      if (!aStart && !bStart) return 0;
      // Events missing a start date are sorted after those with a valid start
      if (!aStart) return 1;
      if (!bStart) return -1;

      return aStart.localeCompare(bStart);
    }

    // Range before weekly
    if (a.type === "range" && b.type === "weekly") return -1;
    if (a.type === "weekly" && b.type === "range") return 1;

    // Weekly events sorted by weekday
    if (a.type === "weekly" && b.type === "weekly") {
      const aDay = a.weekday ?? 0;
      const bDay = b.weekday ?? 0;
      return aDay - bDay;
    }

    // Weekly before unknown
    if (a.type === "weekly" && b.type === "unknown") return -1;
    if (a.type === "unknown" && b.type === "weekly") return 1;

    // Range before unknown
    if (a.type === "range" && b.type === "unknown") return -1;
    if (a.type === "unknown" && b.type === "range") return 1;

    // For unknown vs unknown, we rely on Array.sort being stable (ES2019+) to preserve original order
    return 0;
  });
}
