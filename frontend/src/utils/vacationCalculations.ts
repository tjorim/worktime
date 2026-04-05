import type { EventFlag, HdayEvent } from "../lib/hday/types";
import type { TimeOffEntryFlag, TimeOffEntry } from "../lib/timeOff/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry, isTimeOffWeeklyEntry } from "../lib/timeOff/types";
import {
  getEntryTimeFlagsFromDisplayFlags,
  getEntryTypeFromDisplayFlags,
} from "../lib/timeOff/codecs";
import { dayjs } from "./dateTimeUtils";

export type VacationAllowanceUnit = "days" | "hours";

export interface VacationAllowanceSettings {
  yearlyAmounts: Record<string, number>;
  unit: VacationAllowanceUnit;
  hoursPerDay: number;
}

export function isValidVacationAllowanceUnit(value: unknown): value is VacationAllowanceUnit {
  return typeof value === "string" && (value === "days" || value === "hours");
}

/**
 * Validate a vacation allowance payload from untrusted sources (e.g. wizard completion).
 * Returns `{ valid: true }` or `{ valid: false, errors: string[] }`.
 */
export function validateVacationAllowance(allowance: unknown): {
  valid: boolean;
  errors: string[];
} {
  if (typeof allowance !== "object" || allowance === null) {
    return { valid: false, errors: ["vacationAllowance must be an object"] };
  }

  const { yearlyAmounts, unit } = allowance as Record<string, unknown>;
  const errors: string[] = [];

  const yearlyValues =
    typeof yearlyAmounts === "object" && yearlyAmounts !== null
      ? Object.values(yearlyAmounts as Record<string, unknown>)
      : [];

  if (
    typeof yearlyAmounts !== "object" ||
    yearlyAmounts === null ||
    yearlyValues.length === 0 ||
    !yearlyValues.every((v) => typeof v === "number" && Number.isFinite(v) && (v as number) >= 0)
  ) {
    errors.push("yearlyAmounts must contain only non-negative numbers");
  }

  if (!isValidVacationAllowanceUnit(unit)) {
    errors.push(`unit must be "days" or "hours", got "${String(unit)}"`);
  }

  return { valid: errors.length === 0, errors };
}

export type EventTypeKey =
  | "holiday"
  | "business"
  | "course"
  | "in"
  | "weekend"
  | "birthday"
  | "ill"
  | "other";

export const EVENT_TYPE_LABELS: Record<EventTypeKey, string> = {
  holiday: "Holiday",
  business: "Business trip",
  course: "Training",
  in: "In office",
  weekend: "Weekend",
  birthday: "Birthday",
  ill: "Sick leave",
  other: "Other",
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

export interface VacationTypeTotals {
  key: EventTypeKey;
  label: string;
  days: number;
  hours: number;
}

export interface VacationYearStats {
  year: number;
  totalDays: number;
  totalHours: number;
  holidayDays: number;
  holidayHours: number;
  byType: VacationTypeTotals[];
}

const HALF_DAY_FLAGS: TimeOffEntryFlag[] = ["half_am", "half_pm"];

const isHalfDay = (flags?: TimeOffEntryFlag[]): boolean => {
  if (!flags) return false;
  const hasAm = flags.includes("half_am");
  const hasPm = flags.includes("half_pm");
  return hasAm !== hasPm;
};

const getDayWeight = (flags?: TimeOffEntryFlag[]): number => (isHalfDay(flags) ? 0.5 : 1);

const getEventTypeKey = (entryType: TimeOffEntry["entryType"]): EventTypeKey => {
  return entryType === "vacation" ? "holiday" : entryType;
};

const isDateInYear = (date: string, year: number): boolean => {
  const parsed = dayjs(date);
  if (!parsed.isValid()) return false;
  const yearStart = dayjs(`${year}-01-01`).startOf("day");
  const yearEnd = dayjs(`${year}-12-31`).startOf("day");
  return parsed.isSameOrAfter(yearStart, "day") && parsed.isSameOrBefore(yearEnd, "day");
};

function isEntryArray(entries: TimeOffEntry[] | HdayEvent[] | undefined): entries is TimeOffEntry[] {
  return !entries || entries.length === 0 || "kind" in entries[0]!;
}

function getTypeKeyFromLegacyFlags(flags?: EventFlag[]): EventTypeKey {
  const rawFlags = flags ?? [];
  const explicitTypeFlag = rawFlags.find(
    (flag) =>
      flag === "business" ||
      flag === "course" ||
      flag === "in" ||
      flag === "weekend" ||
      flag === "birthday" ||
      flag === "ill" ||
      flag === "other",
  );
  const entryType = getEntryTypeFromDisplayFlags(explicitTypeFlag ? [explicitTypeFlag] : ["holiday"]);
  return getEventTypeKey(entryType);
}

function getDayWeightFromLegacyFlags(flags?: EventFlag[]): number {
  const rawFlags = flags ?? [];
  const hasAm = rawFlags.includes("half_am");
  const hasPm = rawFlags.includes("half_pm");
  if (hasAm !== hasPm) return 0.5;
  if (hasAm && hasPm) return 1;
  return getDayWeight(getEntryTimeFlagsFromDisplayFlags(rawFlags));
}

function parseLegacyRange(event: HdayEvent): { start: ReturnType<typeof dayjs>; end: ReturnType<typeof dayjs> } | null {
  if (event.type !== "range" || !event.start) return null;
  const start = dayjs(event.start.replace(/\//g, "-")).startOf("day");
  const end = dayjs((event.end ?? event.start).replace(/\//g, "-")).startOf("day");
  if (!start.isValid() || !end.isValid() || end.isBefore(start, "day")) return null;
  return { start, end };
}

function countWeeklyOccurrencesInYear(year: number, weekday: number): number {
  if (weekday < 1 || weekday > 7) return 0;
  let current = dayjs(`${year}-01-01`).startOf("day");
  const end = dayjs(`${year}-12-31`).startOf("day");
  let count = 0;

  while (current.isSameOrBefore(end, "day")) {
    if (current.isoWeekday() === weekday) count += 1;
    current = current.add(1, "day");
  }

  return count;
}

function countRangeDaysInYear(start: string, end: string, year: number): number {
  const rangeStart = dayjs(start).startOf("day");
  const rangeEnd = dayjs(end).startOf("day");
  if (!rangeStart.isValid() || !rangeEnd.isValid() || rangeEnd.isBefore(rangeStart, "day")) {
    return 0;
  }

  const yearStart = dayjs(`${year}-01-01`).startOf("day");
  const yearEnd = dayjs(`${year}-12-31`).startOf("day");
  const effectiveStart = rangeStart.isBefore(yearStart, "day") ? yearStart : rangeStart;
  const effectiveEnd = rangeEnd.isAfter(yearEnd, "day") ? yearEnd : rangeEnd;
  if (effectiveEnd.isBefore(effectiveStart, "day")) return 0;

  return effectiveEnd.diff(effectiveStart, "day") + 1;
}

export const getAvailableYears = (
  entries: TimeOffEntry[] | HdayEvent[] | undefined,
  fallbackYear: number,
): number[] => {
  const years = new Set<number>();
  years.add(fallbackYear);

  if (!entries || entries.length === 0) {
    return Array.from(years).sort((a, b) => b - a);
  }

  if (isEntryArray(entries)) {
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
  } else {
    entries.forEach((event) => {
      if (event.type !== "range") return;
      const range = parseLegacyRange(event);
      if (!range) return;
      let current = range.start;
      while (current.isSameOrBefore(range.end, "day")) {
        years.add(current.year());
        current = current.add(1, "day");
      }
    });
  }

  return Array.from(years).sort((a, b) => b - a);
};

export const calculateVacationStats = (
  entries: TimeOffEntry[] | HdayEvent[] | undefined,
  year: number,
  hoursPerDay: number,
): VacationYearStats => {
  const totals: Record<EventTypeKey, { days: number; hours: number }> = {
    holiday: { days: 0, hours: 0 },
    business: { days: 0, hours: 0 },
    course: { days: 0, hours: 0 },
    in: { days: 0, hours: 0 },
    weekend: { days: 0, hours: 0 },
    birthday: { days: 0, hours: 0 },
    ill: { days: 0, hours: 0 },
    other: { days: 0, hours: 0 },
  };

  let totalDays = 0;

  if (!entries || entries.length === 0) {
    return {
      year,
      totalDays: 0,
      totalHours: 0,
      holidayDays: 0,
      holidayHours: 0,
      byType: EVENT_TYPE_ORDER.map((key) => ({
        key,
        label: EVENT_TYPE_LABELS[key],
        days: 0,
        hours: 0,
      })),
    };
  }

  if (isEntryArray(entries)) {
    entries.forEach((entry) => {
      const typeKey = getEventTypeKey(entry.entryType);
      const dayValue = getDayWeight(entry.flags);
      if (isTimeOffWeeklyEntry(entry)) {
        const occurrences = countWeeklyOccurrencesInYear(year, entry.weekday);
        const totalForEntry = occurrences * dayValue;
        totals[typeKey].days += totalForEntry;
        totals[typeKey].hours += totalForEntry * hoursPerDay;
        totalDays += totalForEntry;
        return;
      }

      if (isTimeOffDateEntry(entry)) {
        if (!isDateInYear(entry.date, year)) return;

        const hourValue = dayValue * hoursPerDay;
        totals[typeKey].days += dayValue;
        totals[typeKey].hours += hourValue;
        totalDays += dayValue;
        return;
      }

      if (isTimeOffRangeEntry(entry)) {
        const daysInYear = countRangeDaysInYear(entry.start, entry.end, year);
        if (daysInYear === 0) return;

        const totalForEntry = daysInYear * dayValue;
        totals[typeKey].days += totalForEntry;
        totals[typeKey].hours += totalForEntry * hoursPerDay;
        totalDays += totalForEntry;
      }
    });
  } else {
    entries.forEach((event) => {
      if (event.type === "unknown") return;

      const rawFlags = event.flags ?? ["holiday"];
      const typeKey = getTypeKeyFromLegacyFlags(rawFlags);
      const dayValue = getDayWeightFromLegacyFlags(rawFlags);

      if (event.type === "weekly") {
        const occurrences = countWeeklyOccurrencesInYear(year, event.weekday ?? 0);
        const totalForEvent = occurrences * dayValue;
        totals[typeKey].days += totalForEvent;
        totals[typeKey].hours += totalForEvent * hoursPerDay;
        totalDays += totalForEvent;
        return;
      }

      const range = parseLegacyRange(event);
      if (!range) return;

      const yearStart = dayjs(`${year}-01-01`).startOf("day");
      const yearEnd = dayjs(`${year}-12-31`).startOf("day");
      const effectiveStart = range.start.isBefore(yearStart, "day") ? yearStart : range.start;
      const effectiveEnd = range.end.isAfter(yearEnd, "day") ? yearEnd : range.end;
      if (effectiveEnd.isBefore(effectiveStart, "day")) return;

      const daysInYear = effectiveEnd.diff(effectiveStart, "day") + 1;
      const totalForEvent = daysInYear * dayValue;
      totals[typeKey].days += totalForEvent;
      totals[typeKey].hours += totalForEvent * hoursPerDay;
      totalDays += totalForEvent;
    });
  }

  const totalHours = totalDays * hoursPerDay;
  const holidayDays = totals.holiday.days;
  const holidayHours = totals.holiday.hours;

  return {
    year,
    totalDays,
    totalHours,
    holidayDays,
    holidayHours,
    byType: EVENT_TYPE_ORDER.map((key) => ({
      key,
      label: EVENT_TYPE_LABELS[key],
      days: totals[key].days,
      hours: totals[key].hours,
    })),
  };
};

export const getEffectiveAmount = (allowance: VacationAllowanceSettings, year: number): number =>
  allowance.yearlyAmounts[String(year)] ?? 0;

export const getAllowanceDays = (allowance: VacationAllowanceSettings, year: number): number => {
  const amount = getEffectiveAmount(allowance, year);
  if (allowance.unit === "days") return amount;
  if (allowance.hoursPerDay <= 0) return 0;
  return amount / allowance.hoursPerDay;
};

export const getAllowanceHours = (allowance: VacationAllowanceSettings, year: number): number => {
  const amount = getEffectiveAmount(allowance, year);
  if (allowance.unit === "hours") return amount;
  return amount * allowance.hoursPerDay;
};

export const sanitizeVacationAllowance = (
  allowance: Partial<VacationAllowanceSettings> | undefined,
  fallback: VacationAllowanceSettings,
): VacationAllowanceSettings => {
  const rawYearly = allowance?.yearlyAmounts;
  const yearlyAmounts: Record<string, number> = { ...fallback.yearlyAmounts };
  if (typeof rawYearly === "object" && rawYearly !== null) {
    for (const [key, val] of Object.entries(rawYearly)) {
      // Only accept keys that are well-formed positive integer year strings
      if (!/^\d+$/.test(key)) {
        console.warn(`sanitizeVacationAllowance: skipped non-numeric year key "${key}"`);
        continue;
      }
      const parsedKey = Number.parseInt(key, 10);
      if (parsedKey <= 0) {
        console.warn(`sanitizeVacationAllowance: skipped invalid year "${key}"`);
        continue;
      }
      if (typeof val === "number" && Number.isFinite(val) && val >= 0) {
        yearlyAmounts[key] = val;
      }
    }
  }
  const unit =
    allowance?.unit === "hours" || allowance?.unit === "days" ? allowance.unit : fallback.unit;
  const hoursPerDay =
    typeof allowance?.hoursPerDay === "number" && Number.isFinite(allowance.hoursPerDay)
      ? Math.max(1, allowance.hoursPerDay)
      : fallback.hoursPerDay;

  return { yearlyAmounts, unit, hoursPerDay };
};

export const formatVacationValue = (value: number): string => {
  if (Number.isNaN(value)) return "0";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
};

export const getHalfDayLabel = (flags?: TimeOffEntryFlag[]): string | null => {
  if (!flags) return null;
  const hasHalfFlag = flags.some((flag) => HALF_DAY_FLAGS.includes(flag));
  if (!hasHalfFlag) return null;
  return isHalfDay(flags) ? "Half day" : null;
};
