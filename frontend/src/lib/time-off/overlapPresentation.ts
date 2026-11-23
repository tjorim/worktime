import { formatDisplayDate } from "@/lib/dates/dateTimeUtils";
import { getEventTypeLabel } from "@/lib/hday/presentation";
import { getEntryFlagsForDisplay } from "@/lib/time-off/codecs";
import type { OverlapPeriod } from "@/lib/time-off/overlap";
import type { TimeOffEntry } from "@/lib/time-off/types";
import * as m from "@/paraglide/messages.js";

export const weekdayMessages = [
  m.weekday_mon,
  m.weekday_tue,
  m.weekday_wed,
  m.weekday_thu,
  m.weekday_fri,
  m.weekday_sat,
  m.weekday_sun,
] as const;

export function formatOverlapWarning(entry: TimeOffEntry, period: OverlapPeriod) {
  const name = entry.note || getEventTypeLabel(getEntryFlagsForDisplay(entry));
  if ("weekday" in period) {
    return m.timeoff_overlap_recurring({
      name,
      day: weekdayMessages[period.weekday - 1]?.() ?? "—",
    });
  }
  const start = formatDisplayDate(period.start);
  return period.start === period.end
    ? m.timeoff_overlap_on_date({ name, date: start })
    : m.timeoff_overlap_on_range({ name, start, end: formatDisplayDate(period.end) });
}
