import baseDayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import isoWeek from "dayjs/plugin/isoWeek";
import isoWeeksInYear from "dayjs/plugin/isoWeeksInYear";
import isLeapYear from "dayjs/plugin/isLeapYear";
import isSameOrAfter from "dayjs/plugin/isSameOrAfter";
import isSameOrBefore from "dayjs/plugin/isSameOrBefore";
import "dayjs/locale/en-gb";

let initialized = false;
const dayjs = baseDayjs;

export function initializeDayjs(): void {
  if (initialized) {
    return;
  }

  dayjs.extend(isoWeek);
  dayjs.extend(isLeapYear);
  dayjs.extend(isoWeeksInYear);
  dayjs.extend(isSameOrAfter);
  dayjs.extend(isSameOrBefore);
  dayjs.extend(customParseFormat);
  dayjs.locale("en-gb");

  initialized = true;
}

export { dayjs };
