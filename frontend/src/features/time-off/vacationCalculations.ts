import type { LucideIcon } from "lucide-react";
import {
  BriefcaseIcon,
  BuildingIcon,
  CalendarXIcon,
  EllipsisIcon,
  GiftIcon,
  GraduationCapIcon,
  ThermometerIcon,
  UmbrellaIcon,
} from "lucide-react";
import type { TimeOffEntryFlag, TimeOffEntry } from "@/lib/time-off/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry } from "@/lib/time-off/types";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import {
  isLeaveEntry,
  statisticsWorkingDays,
  timeOffHalves,
  type WorkingDayOptions,
} from "@/lib/schedule/statisticsWorkingDays";
import { getEventTypeLabel } from "@/lib/hday/presentation";
import { getEntryTypeFlag } from "@/lib/time-off/codecs";
import * as m from "@/paraglide/messages.js";

export type EventTypeKey =
  | "holiday"
  | "business"
  | "course"
  | "in"
  | "weekend"
  | "birthday"
  | "ill"
  | "other";

export const getEventTypeKeyLabel = (key: EventTypeKey): string => getEventTypeLabel([key]);

export const EVENT_TYPE_ORDER: EventTypeKey[] = [
  "holiday",
  "business",
  "course",
  "in",
  "weekend",
  "birthday",
  "ill",
  "other",
];

export const EVENT_TYPE_ICONS: Record<EventTypeKey, LucideIcon> = {
  holiday: UmbrellaIcon,
  business: BriefcaseIcon,
  course: GraduationCapIcon,
  in: BuildingIcon,
  weekend: CalendarXIcon,
  birthday: GiftIcon,
  ill: ThermometerIcon,
  other: EllipsisIcon,
};

export interface VacationTypeTotals {
  key: EventTypeKey;
  label: string;
  days: number;
}

export interface VacationYearStats {
  year: number;
  totalDays: number;
  byType: VacationTypeTotals[];
  otherByType: VacationTypeTotals[];
}

const isHalfDay = (flag?: TimeOffEntryFlag | null): boolean =>
  flag === "half_am" || flag === "half_pm";

export const getAvailableYears = (
  entries: TimeOffEntry[] | undefined,
  fallbackYear: number,
): number[] => {
  const years = new Set<number>();
  years.add(fallbackYear);

  if (!entries || entries.length === 0) {
    return Array.from(years).sort((a, b) => b - a);
  }

  entries.forEach((entry) => {
    if (isTimeOffDateEntry(entry)) {
      const parsed = dayjs(entry.date);
      if (parsed.isValid()) years.add(parsed.year());
      return;
    }

    if (isTimeOffRangeEntry(entry)) {
      const start = dayjs(entry.start).startOf("day");
      const end = dayjs(entry.end).startOf("day");
      if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) return;

      for (let coveredYear = start.year(); coveredYear <= end.year(); coveredYear += 1) {
        years.add(coveredYear);
      }
    }
  });

  return Array.from(years).sort((a, b) => b - a);
};

export const calculateVacationStats = (
  entries: TimeOffEntry[] | undefined,
  year: number,
  options: WorkingDayOptions = { team: 1, schedule: "9-5", holidays: new Map() },
): VacationYearStats => {
  if (!entries?.length) return { year, totalDays: 0, byType: [], otherByType: [] };

  const leaveTotals = new Map<EventTypeKey, number>();
  const otherTotals = new Map<EventTypeKey, number>();
  let totalDays = 0;
  const typeKey = (entry: TimeOffEntry) => getEntryTypeFlag(entry.entryType);
  const ordered = [...entries].sort(
    (a, b) =>
      Number(isLeaveEntry(b)) - Number(isLeaveEntry(a)) ||
      EVENT_TYPE_ORDER.indexOf(typeKey(a)) - EVENT_TYPE_ORDER.indexOf(typeKey(b)),
  );
  for (const { date } of statisticsWorkingDays(
    dayjs(`${year}-01-01`),
    dayjs(`${year}-12-31`),
    options,
  )) {
    for (const entry of timeOffHalves(date, ordered)) {
      if (!entry) continue;
      const leave = isLeaveEntry(entry);
      const totals = leave ? leaveTotals : otherTotals;
      const key = typeKey(entry);
      totals.set(key, (totals.get(key) ?? 0) + 0.5);
      if (leave) totalDays += 0.5;
    }
  }

  const breakdown = (totals: ReadonlyMap<EventTypeKey, number>) =>
    EVENT_TYPE_ORDER.flatMap((key) => {
      const days = totals.get(key);
      return days === undefined ? [] : [{ key, label: getEventTypeKeyLabel(key), days }];
    });

  return { year, totalDays, byType: breakdown(leaveTotals), otherByType: breakdown(otherTotals) };
};

export const getHalfDayLabel = (flag?: TimeOffEntryFlag | null): string | null =>
  isHalfDay(flag) ? m.timeoff_half_day() : null;
