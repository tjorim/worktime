import type { KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Button from "react-bootstrap/Button";
import { dayjs, formatHdayDate } from "../../utils/dateTimeUtils";
import type { HdayEvent } from "../../lib/hday/types";
import type { PublicHolidayInfo } from "../../types/publicHolidays";
import type { SchoolHolidayInfo } from "../../types/schoolHolidays";
import type { PaydayInfo } from "../../types/paydays";
import type { ScheduleOption } from "../../data/rosters";
import { calculateShift } from "../../utils/shiftCalculations";
import { isWorkingDay, getNonWorkingReason } from "../../utils/workingDayUtils";
import { WorkingDayCell } from "./WorkingDayCell";

interface WorkingScheduleCalendarProps {
  myTeam: number;
  scheduleType: ScheduleOption | null | undefined;
  month: dayjs.Dayjs;
  onMonthChange: (month: dayjs.Dayjs) => void;
  events: HdayEvent[];
  publicHolidays?: Map<string, PublicHolidayInfo>;
  schoolHolidays?: Map<string, SchoolHolidayInfo>;
  paydayMap?: Map<string, PaydayInfo>;
}

const DAY_FORMAT = "YYYY-MM-DD";

/**
 * Builds a complete calendar grid for the given month.
 * Includes days from adjacent months to fill complete weeks (Sunday to Saturday).
 */
const buildCalendarDays = (month: dayjs.Dayjs) => {
  const start = month.startOf("month").startOf("week");
  const end = month.endOf("month").endOf("week");
  const days: dayjs.Dayjs[] = [];
  let current = start;
  while (current.isBefore(end) || current.isSame(end, "day")) {
    days.push(current);
    current = current.add(1, "day");
  }
  return days;
};

/**
 * WorkingScheduleCalendar displays a monthly calendar showing the user's working schedule.
 *
 * Features:
 * - Shows shift information for each working day
 * - Marks non-working days (scheduled off, time-off, public holidays)
 * - Displays time-off events and public holiday names
 * - Keyboard navigation with arrow keys, Home, and End
 * - Highlights weekends, today, and special days
 *
 * The calendar integrates:
 * - Shift schedule based on roster type
 * - Time-off events
 * - Public holidays with shift-specific logic (night shift rule)
 * - School holidays
 * - Paydays
 *
 * @param props.myTeam - The user's team number
 * @param props.scheduleType - The user's schedule type
 * @param props.month - The currently displayed month
 * @param props.onMonthChange - Callback when month navigation occurs
 * @param props.events - Array of time-off events
 * @param props.publicHolidays - Map of public holidays by date
 * @param props.schoolHolidays - Map of school holidays by date
 * @param props.paydayMap - Map of paydays by date
 */
export function WorkingScheduleCalendar({
  myTeam,
  scheduleType,
  month,
  onMonthChange,
  events,
  publicHolidays = new Map(),
  schoolHolidays = new Map(),
  paydayMap = new Map(),
}: WorkingScheduleCalendarProps) {
  const days = useMemo(() => buildCalendarDays(month), [month]);
  const today = dayjs();
  const [focusedDateKey, setFocusedDateKey] = useState<string>(() => {
    const todayKey = today.format(DAY_FORMAT);
    const monthStart = month.startOf("month").format(DAY_FORMAT);
    const monthEnd = month.endOf("month").format(DAY_FORMAT);
    // Focus today if in current month, otherwise first day of month
    const todayInRange = (today.isAfter(monthStart) || today.isSame(monthStart, "day")) &&
                         (today.isBefore(monthEnd) || today.isSame(monthEnd, "day"));
    return todayInRange ? todayKey : monthStart;
  });
  const calendarRef = useRef<HTMLDivElement>(null);

  // Update focused date when month changes
  useEffect(() => {
    const monthStart = month.startOf("month").format(DAY_FORMAT);
    const monthEnd = month.endOf("month").format(DAY_FORMAT);
    const todayKey = today.format(DAY_FORMAT);

    // If today is in the new month, focus it; otherwise focus first day of month
    const todayInRange = (today.isAfter(monthStart) || today.isSame(monthStart, "day")) &&
                         (today.isBefore(monthEnd) || today.isSame(monthEnd, "day"));
    if (todayInRange) {
      setFocusedDateKey(todayKey);
    } else {
      setFocusedDateKey(monthStart);
    }
  }, [month, today]);

  const handlePreviousMonth = () => {
    onMonthChange(month.subtract(1, "month"));
  };

  const handleNextMonth = () => {
    onMonthChange(month.add(1, "month"));
  };

  const handleToday = () => {
    onMonthChange(dayjs());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const focusedDate = dayjs(focusedDateKey);
    let newDate: dayjs.Dayjs | null = null;

    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        newDate = focusedDate.subtract(1, "day");
        break;
      case "ArrowRight":
        event.preventDefault();
        newDate = focusedDate.add(1, "day");
        break;
      case "ArrowUp":
        event.preventDefault();
        newDate = focusedDate.subtract(1, "week");
        break;
      case "ArrowDown":
        event.preventDefault();
        newDate = focusedDate.add(1, "week");
        break;
      case "Home":
        event.preventDefault();
        newDate = month.startOf("month");
        break;
      case "End":
        event.preventDefault();
        newDate = month.endOf("month");
        break;
      default:
        return;
    }

    if (newDate) {
      // Change month if navigated outside current month
      if (!newDate.isSame(month, "month")) {
        onMonthChange(newDate.startOf("month"));
      }
      setFocusedDateKey(newDate.format(DAY_FORMAT));
    }
  };

  // Create a grid of weeks for the calendar
  const weeks: dayjs.Dayjs[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div
      className="working-schedule-calendar"
      ref={calendarRef}
      onKeyDown={handleKeyDown}
      role="application"
      aria-label="Working schedule calendar"
    >
      {/* Calendar header with navigation */}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h5 className="mb-0">{month.format("MMMM YYYY")}</h5>
        <div className="btn-group" role="group" aria-label="Month navigation">
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handlePreviousMonth}
            aria-label="Previous month"
          >
            <i className="bi bi-chevron-left"></i>
          </Button>
          <Button variant="outline-secondary" size="sm" onClick={handleToday} aria-label="Today">
            Today
          </Button>
          <Button
            variant="outline-secondary"
            size="sm"
            onClick={handleNextMonth}
            aria-label="Next month"
          >
            <i className="bi bi-chevron-right"></i>
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="calendar-legend mb-2 small text-muted">
        <div className="d-flex flex-wrap gap-3">
          <span>
            <span className="badge bg-success me-1">M</span> Working day with shift
          </span>
          <span>
            <span className="badge bg-secondary me-1">O</span> Scheduled off
          </span>
          <span>
            <span className="badge bg-warning text-dark me-1">🏖️</span> Time off
          </span>
          <span>
            <span className="badge bg-danger me-1">🎉</span> Public holiday
          </span>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="table-responsive">
        <table className="table table-bordered calendar-grid" role="grid">
          <thead>
            <tr role="row">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <th key={day} scope="col" role="columnheader" className="text-center">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, weekIndex) => (
              <tr key={weekIndex} role="row">
                {week.map((day) => {
                  const dateKey = day.format(DAY_FORMAT);
                  const isCurrentMonth = day.isSame(month, "month");
                  const isToday = day.isSame(today, "day");
                  const isFocused = dateKey === focusedDateKey;

                  // Calculate shift and working status
                  let shift = null;
                  let working = false;
                  let nonWorkingReason: string | null = null;

                  try {
                    shift = calculateShift(day, myTeam, scheduleType);
                    working = isWorkingDay(day, myTeam, scheduleType, events, publicHolidays);
                    if (!working) {
                      nonWorkingReason = getNonWorkingReason(
                        day,
                        myTeam,
                        scheduleType,
                        events,
                        publicHolidays,
                      );
                    }
                  } catch (error) {
                    // Error calculating shift - will show as non-working
                  }

                  // Get additional information
                  const publicHoliday = publicHolidays.get(formatHdayDate(day));
                  const schoolHoliday = schoolHolidays.get(formatHdayDate(day));
                  const payday = paydayMap.get(formatHdayDate(day));

                  return (
                    <WorkingDayCell
                      key={dateKey}
                      date={day}
                      isCurrentMonth={isCurrentMonth}
                      isToday={isToday}
                      isFocused={isFocused}
                      shift={shift}
                      isWorking={working}
                      nonWorkingReason={nonWorkingReason}
                      publicHoliday={publicHoliday}
                      schoolHoliday={schoolHoliday}
                      payday={payday}
                      events={events}
                      onFocus={() => setFocusedDateKey(dateKey)}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Instructions */}
      <div className="text-muted small mt-2">
        <i className="bi bi-keyboard me-1"></i>
        Use arrow keys to navigate, Home/End to jump to month start/end
      </div>
    </div>
  );
}
