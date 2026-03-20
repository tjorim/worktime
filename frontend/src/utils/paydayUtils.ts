import type { PublicHolidayInfo } from "../types/publicHolidays";
import { dayjs, formatHdayDate, getISOWeekday, pad2 } from "./dateTimeUtils";

import type { PaydayInfo } from "../types/paydays";

const PAYDAY_LABEL = "Payday";
const PAYDAY_DAY_OF_MONTH = 25;

const isBusinessDay = (date: dayjs.Dayjs, holidayMap: Map<string, PublicHolidayInfo>) => {
  const isoWeekday = getISOWeekday(date);
  const isWeekend = isoWeekday === 6 || isoWeekday === 7;
  const isHoliday = holidayMap.has(formatHdayDate(date));
  return !isWeekend && !isHoliday;
};

const getPaydayForMonth = (
  year: number,
  month: number,
  holidayMap: Map<string, PublicHolidayInfo>,
) => {
  const scheduledPayday = dayjs(`${year}-${pad2(month)}-${PAYDAY_DAY_OF_MONTH}`);
  // Special rule: December payday is always set to the 23rd to avoid December 24 (Christmas Eve).
  // This ensures employees receive their salary well before the Christmas holiday period.
  const isDecemberChristmasHoliday =
    month === 12 && holidayMap.has(formatHdayDate(scheduledPayday));
  let payday = isDecemberChristmasHoliday ? dayjs(`${year}-12-23`) : scheduledPayday;
  while (!isBusinessDay(payday, holidayMap)) {
    payday = payday.subtract(1, "day");
  }
  return payday;
};

export const getMonthlyPaydayMap = (
  year: number,
  holidayMap: Map<string, PublicHolidayInfo>,
  label: string = PAYDAY_LABEL,
): Map<string, PaydayInfo> => {
  const map = new Map<string, PaydayInfo>();
  for (let month = 1; month <= 12; month += 1) {
    const payday = getPaydayForMonth(year, month, holidayMap);
    map.set(formatHdayDate(payday), { name: label });
  }
  return map;
};
