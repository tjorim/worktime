const DATE_FORMAT_REGEX = /^(\d{4})\/(\d{2})\/(\d{2})$/;

/** Validate a real calendar date in the portable .hday YYYY/MM/DD format. */
export function isValidHdayDate(dateString: string): boolean {
  const match = DATE_FORMAT_REGEX.exec(dateString);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1]!;
}
