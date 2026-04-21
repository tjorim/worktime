import type { TimeOffEntryFlag, TimeOffEntry } from "@/lib/timeOff/types";
import { isTimeOffDateEntry, isTimeOffRangeEntry, isTimeOffWeeklyEntry } from "@/lib/timeOff/types";
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

export const EVENT_TYPE_ICONS: Record<EventTypeKey, string> = {
  holiday: "bi-umbrella",
  business: "bi-briefcase",
  course: "bi-mortarboard",
  in: "bi-building",
  weekend: "bi-calendar-x",
  birthday: "bi-gift",
  ill: "bi-thermometer-half",
  other: "bi-three-dots",
};

export const EVENT_TYPE_COLORS: Record<EventTypeKey, string> = {
  holiday: "primary",
  business: "info",
  course: "success",
  in: "secondary",
  weekend: "secondary",
  birthday: "warning",
  ill: "danger",
  other: "secondary",
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

const getDayWeight = (flag?: TimeOffEntryFlag | null): number => (isHalfDay(flag) ? 0.5 : 1);

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

function countWeeklyOccurrencesInYear(year: number, weekday: number): number {
  if (weekday < 1 || weekday > 7) return 0;
  const jan1 = dayjs(`${year}-01-01`).startOf("day");
  let current = jan1.isoWeekday(weekday);
  if (current.isBefore(jan1, "day")) current = current.add(7, "day");
  const end = dayjs(`${year}-12-31`).startOf("day");
  let count = 0;

  while (current.isSameOrBefore(end, "day")) {
    count += 1;
    current = current.add(7, "day");
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
        label: EVENT_TYPE_LABELS[key],
        days: 0,
      })),
    };
  }

  entries.forEach((entry) => {
    const typeKey = getEventTypeKey(entry.entryType);
    const dayValue = getDayWeight(entry.entryFlag);
    if (isTimeOffWeeklyEntry(entry)) {
      const occurrences = countWeeklyOccurrencesInYear(year, entry.weekday);
      const totalForEntry = occurrences * dayValue;
      totals[typeKey] += totalForEntry;
      totalDays += totalForEntry;
      return;
    }

    if (isTimeOffDateEntry(entry)) {
      if (!isDateInYear(entry.date, year)) return;
      totals[typeKey] += dayValue;
      totalDays += dayValue;
      return;
    }

    if (isTimeOffRangeEntry(entry)) {
      const daysInYear = countRangeDaysInYear(entry.start, entry.end, year);
      if (daysInYear === 0) return;
      const totalForEntry = daysInYear * dayValue;
      totals[typeKey] += totalForEntry;
      totalDays += totalForEntry;
    }
  });

  return {
    year,
    totalDays,
    byType: EVENT_TYPE_ORDER.map((key) => ({
      key,
      label: EVENT_TYPE_LABELS[key],
      days: totals[key],
    })),
  };
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

export const getHalfDayLabel = (flag?: TimeOffEntryFlag | null): string | null =>
  isHalfDay(flag) ? "Half day" : null;
