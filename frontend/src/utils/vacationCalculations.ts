import type { HdayEvent } from "../lib/hday/types";
import type { TimeOffEntryFlag, TimeOffEntry } from "../lib/timeOff/types";
import { hdayToTimeOffEntries } from "../lib/timeOff/codecs";
import { toLine } from "../lib/hday/serializer";
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

function normalizeEntries(entries: TimeOffEntry[] | HdayEvent[]): TimeOffEntry[] {
  if (entries.length === 0) return [];
  const first = entries[0] as TimeOffEntry | HdayEvent;
  if ("date" in first) {
    return entries as TimeOffEntry[];
  }

  const lines = (entries as HdayEvent[])
    .filter((event) => event.type === "range")
    .map((event) => toLine(event));
  return hdayToTimeOffEntries(lines.join("\n")).entries;
}

export const getAvailableYears = (entries: TimeOffEntry[] | HdayEvent[], fallbackYear: number): number[] => {
  const normalizedEntries = normalizeEntries(entries);
  const years = new Set<number>();
  years.add(fallbackYear);

  normalizedEntries.forEach((entry) => {
    const parsed = dayjs(entry.date);
    if (parsed.isValid()) years.add(parsed.year());
  });

  return Array.from(years).sort((a, b) => b - a);
};

export const calculateVacationStats = (
  entries: TimeOffEntry[] | HdayEvent[],
  year: number,
  hoursPerDay: number,
): VacationYearStats => {
  const normalizedEntries = normalizeEntries(entries);
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

  normalizedEntries.forEach((entry) => {
    if (!isDateInYear(entry.date, year)) return;

    const typeKey = getEventTypeKey(entry.entryType);
    const dayValue = getDayWeight(entry.flags);
    const hourValue = dayValue * hoursPerDay;

    totals[typeKey].days += dayValue;
    totals[typeKey].hours += hourValue;
    totalDays += dayValue;
  });

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
