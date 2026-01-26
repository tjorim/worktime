import type { Dayjs } from "dayjs";
import type { HdayEvent } from "../../lib/hday/types";
import type { PublicHolidayInfo } from "../../types/publicHolidays";
import type { SchoolHolidayInfo } from "../../types/schoolHolidays";
import type { PaydayInfo } from "../../types/paydays";
import type { Shift } from "../../utils/shiftCalculations";
import { hasTimeOffEvent } from "../../utils/workingDayUtils";

/**
 * Builds an accessible aria-label for a calendar day cell.
 */
const buildDayCellAriaLabel = (
  date: Dayjs,
  isWorking: boolean,
  shift: Shift | null,
  publicHoliday?: PublicHolidayInfo,
): string => {
  const parts: string[] = [date.format("MMMM D, YYYY")];

  if (isWorking) {
    parts.push("Working day");
  } else {
    parts.push("Non-working day");
  }

  if (shift) {
    parts.push(`${shift.name} shift`);
  }

  if (publicHoliday) {
    parts.push(publicHoliday.name);
  }

  return parts.join(" - ");
};

interface WorkingDayCellProps {
  date: Dayjs;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFocused: boolean;
  shift: Shift | null;
  isWorking: boolean;
  nonWorkingReason: string | null;
  publicHoliday?: PublicHolidayInfo;
  schoolHoliday?: SchoolHolidayInfo;
  payday?: PaydayInfo;
  events: HdayEvent[];
  onFocus: () => void;
}

/**
 * WorkingDayCell renders a single day cell in the working schedule calendar.
 *
 * Displays:
 * - Day number
 * - Shift badge (M/L/N/D/O) with appropriate styling
 * - Working/non-working status
 * - Time-off events
 * - Public holidays
 * - School holidays
 * - Paydays
 *
 * Styling:
 * - Green badge for working days (M/L/N/D)
 * - Gray badge for off days (O)
 * - Yellow/warning styling for time-off
 * - Red/danger styling for public holidays
 * - Muted text for non-current month days
 * - Bold text for today
 *
 * @param props - Component props with date, shift, and event information
 */
export function WorkingDayCell({
  date,
  isCurrentMonth,
  isToday,
  isFocused,
  shift,
  isWorking,
  nonWorkingReason,
  publicHoliday,
  schoolHoliday,
  payday,
  events,
  onFocus,
}: WorkingDayCellProps) {
  const hasTimeOff = hasTimeOffEvent(date, events);
  const isWeekend = date.day() === 0 || date.day() === 6;

  // Determine cell styling
  let cellClasses = "calendar-day-cell p-2";
  if (!isCurrentMonth) {
    cellClasses += " text-muted";
  }
  if (isToday) {
    cellClasses += " today-cell";
  }
  if (isFocused) {
    cellClasses += " focused-cell";
  }
  if (isWeekend && !publicHoliday) {
    cellClasses += " weekend-cell";
  }
  if (publicHoliday) {
    cellClasses += " public-holiday-cell";
  }
  if (hasTimeOff) {
    cellClasses += " time-off-cell";
  }

  // Determine badge variant based on working status and shift type
  let badgeVariant = "secondary";
  let badgeIcon = "";

  if (isWorking && shift) {
    // Working day - use success (green)
    badgeVariant = "success";
  } else if (shift && !shift.isWorking) {
    // Scheduled off day - use secondary (gray)
    badgeVariant = "secondary";
  } else if (hasTimeOff) {
    // Time off - use warning (yellow/orange)
    badgeVariant = "warning text-dark";
    badgeIcon = "🏖️";
  } else if (publicHoliday) {
    // Public holiday - use danger (red)
    badgeVariant = "danger";
    badgeIcon = "🎉";
  }

  return (
    <td
      role="gridcell"
      className={cellClasses}
      tabIndex={isFocused ? 0 : -1}
      onFocus={onFocus}
      aria-label={buildDayCellAriaLabel(date, isWorking, shift, publicHoliday)}
    >
      <div className="d-flex flex-column" style={{ minHeight: "80px" }}>
        {/* Day number */}
        <div className="d-flex justify-content-between align-items-start mb-1">
          <span className={isToday ? "fw-bold" : ""}>{date.format("D")}</span>
          {shift && (
            <span className={`badge bg-${badgeVariant}`} title={shift.name}>
              {badgeIcon || shift.code}
            </span>
          )}
        </div>

        {/* Status and events */}
        <div className="small">
          {/* Public holiday */}
          {publicHoliday && (
            <div className="text-danger small" title={publicHoliday.localName}>
              <i className="bi bi-star-fill me-1"></i>
              {publicHoliday.name}
            </div>
          )}

          {/* Time off */}
          {hasTimeOff && (
            <div className="text-warning small">
              <i className="bi bi-calendar-x me-1"></i>
              Time off
            </div>
          )}

          {/* Non-working reason (if not already shown) */}
          {!isWorking && !publicHoliday && !hasTimeOff && nonWorkingReason && (
            <div className="text-muted small">{nonWorkingReason}</div>
          )}

          {/* School holiday indicator */}
          {schoolHoliday && (
            <div className="text-info small" title={schoolHoliday.name}>
              <i className="bi bi-backpack me-1"></i>
            </div>
          )}

          {/* Payday indicator */}
          {payday && (
            <div className="text-success small" title="Payday">
              <i className="bi bi-cash me-1"></i>
            </div>
          )}
        </div>
      </div>
    </td>
  );
}
