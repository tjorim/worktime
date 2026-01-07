import type { EventFlag, HdayEvent } from "../lib/hday/types";
import { parseHdayDate as parseHdayDateString } from "../lib/hday/validation";
import { dayjs } from "./dateTimeUtils";

export type VacationAllowanceUnit = "days" | "hours";

export interface VacationAllowanceSettings {
  amount: number;
  unit: VacationAllowanceUnit;
  hoursPerDay: number;
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

const HALF_DAY_FLAGS: EventFlag[] = ["half_am", "half_pm"];

const isHalfDay = (flags?: EventFlag[]): boolean => {
  if (!flags) return false;
  const hasAm = flags.includes("half_am");
  const hasPm = flags.includes("half_pm");
  return hasAm !== hasPm;
};

const getDayWeight = (flags?: EventFlag[]): number => (isHalfDay(flags) ? 0.5 : 1);

const getEventTypeKey = (flags?: EventFlag[]): EventTypeKey => {
  if (!flags || flags.length === 0) return "holiday";
  // Check explicit type flags first (matching priority in getEventTypeLabel)
  if (flags.includes("business")) return "business";
  if (flags.includes("course")) return "course";
  if (flags.includes("in")) return "in";
  if (flags.includes("weekend")) return "weekend";
  if (flags.includes("birthday")) return "birthday";
  if (flags.includes("ill")) return "ill";
  if (flags.includes("other")) return "other";
  // Only use holiday as fallback when no explicit type flags are present
  return "holiday";
};

/**
 * Parse a date string from an HdayEvent and return a Dayjs object.
 * Uses the shared parseHdayDate validation function.
 */
const parseHdayDate = (value?: string) => {
  if (!value) return null;
  const date = parseHdayDateString(value);
  return date ? dayjs(date) : null;
};

const countRangeDaysInYear = (event: HdayEvent, year: number): number => {
  const start = parseHdayDate(event.start);
  const end = parseHdayDate(event.end ?? event.start);
  if (!start || !end) return 0;

  const yearStart = dayjs(`${year}-01-01`).startOf("day");
  const yearEnd = dayjs(`${year}-12-31`).startOf("day");

  // Clamp the range to the target year boundaries
  const rangeStart = start.startOf("day");
  const rangeEnd = end.startOf("day");
  const clampedStart = rangeStart.isBefore(yearStart) ? yearStart : rangeStart;
  const clampedEnd = rangeEnd.isAfter(yearEnd) ? yearEnd : rangeEnd;

  // If the range doesn't overlap with the year, return 0
  if (clampedStart.isAfter(yearEnd) || clampedEnd.isBefore(yearStart)) {
    return 0;
  }

  // Handle inverted ranges (start > end) due to malformed data
  if (clampedStart.isAfter(clampedEnd)) {
    return 0;
  }

  // Calculate the difference in days and add 1 to include both start and end dates
  return clampedEnd.diff(clampedStart, "day") + 1;
};

const countWeeklyDaysInYear = (weekday: number, year: number): number => {
  if (weekday < 1 || weekday > 7) return 0;

  const startOfYear = dayjs(`${year}-01-01`);
  const endOfYear = dayjs(`${year}-12-31`);
  let current = startOfYear.isoWeekday(weekday);

  if (current.isBefore(startOfYear, "day")) {
    current = current.add(7, "day");
  }

  let count = 0;
  while (current.isBefore(endOfYear) || current.isSame(endOfYear, "day")) {
    count += 1;
    current = current.add(7, "day");
  }

  return count;
};

export const getAvailableYears = (events: HdayEvent[], fallbackYear: number): number[] => {
  const years = new Set<number>();
  years.add(fallbackYear);

  events.forEach((event) => {
    if (event.type === "range") {
      const start = parseHdayDate(event.start);
      const end = parseHdayDate(event.end ?? event.start);
      if (!start || !end) return;
      const startYear = start.year();
      const endYear = end.year();
      for (let year = startYear; year <= endYear; year += 1) {
        years.add(year);
      }
    }
  });

  return Array.from(years).sort((a, b) => b - a);
};

export const calculateVacationStats = (
  events: HdayEvent[],
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

  events.forEach((event) => {
    if (event.type === "unknown") return;

    const typeKey = getEventTypeKey(event.flags);
    const weight = getDayWeight(event.flags);
    const count =
      event.type === "range"
        ? countRangeDaysInYear(event, year)
        : countWeeklyDaysInYear(event.weekday ?? 0, year);

    if (count === 0) return;

    const dayValue = count * weight;
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

export const getAllowanceDays = (allowance: VacationAllowanceSettings): number => {
  if (allowance.unit === "days") return allowance.amount;
  if (allowance.hoursPerDay <= 0) return 0;
  return allowance.amount / allowance.hoursPerDay;
};

export const getAllowanceHours = (allowance: VacationAllowanceSettings): number => {
  if (allowance.unit === "hours") return allowance.amount;
  return allowance.amount * allowance.hoursPerDay;
};

export const sanitizeVacationAllowance = (
  allowance: Partial<VacationAllowanceSettings> | undefined,
  fallback: VacationAllowanceSettings,
): VacationAllowanceSettings => {
  const amount =
    typeof allowance?.amount === "number" && Number.isFinite(allowance.amount)
      ? Math.max(0, allowance.amount)
      : fallback.amount;
  const unit =
    allowance?.unit === "hours" || allowance?.unit === "days" ? allowance.unit : fallback.unit;
  const hoursPerDay =
    typeof allowance?.hoursPerDay === "number" && Number.isFinite(allowance.hoursPerDay)
      ? Math.max(1, allowance.hoursPerDay)
      : fallback.hoursPerDay;

  return { amount, unit, hoursPerDay };
};

export const formatVacationValue = (value: number): string => {
  if (Number.isNaN(value)) return "0";
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(1);
};

export const getHalfDayLabel = (flags?: EventFlag[]): string | null => {
  if (!flags) return null;
  const hasHalfFlag = flags.some((flag) => HALF_DAY_FLAGS.includes(flag));
  if (!hasHalfFlag) return null;
  return isHalfDay(flags) ? "Half day" : null;
};
