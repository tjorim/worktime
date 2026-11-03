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
import type { TimeOffEntryFlag, TimeOffEntry } from "@/lib/timeOff/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry } from "@/lib/timeOff/types";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  statisticsWorkingDays,
  timeOffHalves,
  type WorkingDayOptions,
} from "@/utils/statisticsWorkingDays";
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

export const getEventTypeKeyLabel = (key: EventTypeKey): string => {
  switch (key) {
    case "holiday":
      return m.event_type_holiday();
    case "business":
      return m.event_type_business();
    case "course":
      return m.event_type_course();
    case "in":
      return m.event_type_in();
    case "weekend":
      return m.event_type_weekend();
    case "birthday":
      return m.event_type_birthday();
    case "ill":
      return m.event_type_ill();
    case "other":
      return m.event_type_other();
  }
};

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
  const totals: Record<EventTypeKey, number> = {
    holiday: 0,
    business: 0,
    course: 0,
    in: 0,
    weekend: 0,
    birthday: 0,
    ill: 0,
    other: 0,
  };

  let totalDays = 0;

  if (!entries || entries.length === 0) {
    return {
      year,
      totalDays: 0,
      byType: EVENT_TYPE_ORDER.map((key) => ({
        key,
        label: getEventTypeKeyLabel(key),
        days: 0,
      })),
    };
  }

  const ordered = [...entries].sort(
    (a, b) =>
      EVENT_TYPE_ORDER.indexOf(a.entryType === "vacation" ? "holiday" : a.entryType) -
      EVENT_TYPE_ORDER.indexOf(b.entryType === "vacation" ? "holiday" : b.entryType),
  );
  for (const { date } of statisticsWorkingDays(
    dayjs(`${year}-01-01`),
    dayjs(`${year}-12-31`),
    options,
  )) {
    for (const entry of timeOffHalves(date, ordered)) {
      if (!entry) continue;
      totals[entry.entryType === "vacation" ? "holiday" : entry.entryType] += 0.5;
      totalDays += 0.5;
    }
  }

  return {
    year,
    totalDays,
    byType: EVENT_TYPE_ORDER.map((key) => ({
      key,
      label: getEventTypeKeyLabel(key),
      days: totals[key],
    })),
  };
};

export const formatVacationValue = (value: number): string => {
  if (Number.isNaN(value)) return "0";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
};

export const getHalfDayLabel = (flag?: TimeOffEntryFlag | null): string | null =>
  isHalfDay(flag) ? m.timeoff_half_day() : null;
