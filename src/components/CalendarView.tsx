import { useMemo, useState } from "react";
import Card from "react-bootstrap/Card";
import type { Dayjs } from "dayjs";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { dayjs } from "../utils/dateTimeUtils";
import { usePublicHolidays } from "../hooks/usePublicHolidays";
import { useSchoolHolidays } from "../hooks/useSchoolHolidays";
import { getMonthlyPaydayMap } from "../utils/paydayUtils";
import { calculateShift } from "../utils/shiftCalculations";
import { SCHEDULE_OPTIONS } from "../data/rosters";
import { isWorkingDay, hasTimeOffEvent, isPublicHolidayForShift } from "../utils/workingDayUtils";
import { MonthCalendar } from "./calendar/MonthCalendar";

interface CalendarViewProps {
  myTeam: number | null;
}

/**
 * CalendarView displays a monthly calendar showing the user's working schedule.
 *
 * This view reuses the existing MonthCalendar component from the timeoff directory,
 * integrating:
 * - User's roster schedule (shift pattern)
 * - Time-off events from event store
 * - Public holidays (with shift-specific logic)
 * - School holidays
 * - Paydays
 *
 * Key Features:
 * - Shows working vs. non-working days based on schedule
 * - Reuses existing MonthCalendar component for consistency
 * - Displays shift information and time-off events together
 *
 * @param props.myTeam - The user's team number from onboarding or null
 */
export function CalendarView({ myTeam }: CalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState<Dayjs>(dayjs());
  const { events } = useEventStore();
  const { scheduleType } = useSettings();

  // Fetch holidays for the current month's year
  const { publicHolidayMap } = usePublicHolidays(currentMonth.year());
  const { schoolHolidayMap } = useSchoolHolidays(currentMonth.year());

  // Get payday information for the year
  const paydayMapForYear = useMemo(
    () => getMonthlyPaydayMap(currentMonth.year(), publicHolidayMap),
    [currentMonth, publicHolidayMap],
  );

  // Get shift calculation function for the user's team and schedule
  // This shows the actual working schedule and accounts for:
  // 1. Time-off events (holidays registered in time-off management)
  // 2. Public holidays with shift-specific rules (night shifts check next day)
  const getShiftForDate = useMemo(() => {
    if (!myTeam || !scheduleType) return undefined;
    
    const roster = SCHEDULE_OPTIONS.find(opt => opt.value === scheduleType);
    if (!roster) return undefined;

    return (date: Dayjs) => {
      const shift = calculateShift(date, myTeam, scheduleType);
      const shiftConfig = roster.shiftConfig.shiftDisplayOverrides?.[shift.code];
      
      // Determine if this is actually a working day by checking:
      // 1. Scheduled shift is not OFF (O)
      // 2. No time-off event on this day
      // 3. Not a public holiday (with shift-specific logic for night shifts)
      const actuallyWorking = isWorkingDay(date, myTeam, scheduleType, events, publicHolidayMap);
      
      // Additional context for display
      let displayLabel = shiftConfig?.displayName || shift.name;
      if (!actuallyWorking && shift.code !== "O") {
        // Working shift but day off due to time-off or public holiday
        if (hasTimeOffEvent(date, events)) {
          displayLabel = "Time Off";
        } else if (isPublicHolidayForShift(date, myTeam, scheduleType, publicHolidayMap)) {
          displayLabel = "Public Holiday";
        }
      }
      
      return {
        code: shiftConfig?.displayCode || shift.code,
        label: displayLabel,
        isWorking: actuallyWorking,
      };
    };
  }, [myTeam, scheduleType, events, publicHolidayMap]);

  // No-op handlers since we're in view-only mode (not adding/editing events from calendar tab)
  const handleAddEvent = () => {};
  const handleViewEvent = () => {};
  const handleEditEvent = () => {};

  return (
    <div className="calendar-view py-3">
      <Card>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <Card.Title className="mb-0">
              <i className="bi bi-calendar3 me-2" aria-hidden="true"></i>
              My Working Calendar
            </Card.Title>
            {!myTeam && (
              <small className="text-muted">
                <i className="bi bi-info-circle me-1"></i>
                Select a team to see your working schedule
              </small>
            )}
          </div>

          {!myTeam ? (
            <div className="text-center text-muted py-5">
              <i className="bi bi-calendar-x display-4 d-block mb-3"></i>
              <p>No team selected</p>
              <p className="small">
                Please complete the onboarding wizard to select your team and see your working
                schedule.
              </p>
            </div>
          ) : (
            <MonthCalendar
              events={events}
              month={currentMonth}
              publicHolidays={publicHolidayMap}
              schoolHolidays={schoolHolidayMap}
              paydayMap={paydayMapForYear}
              onMonthChange={setCurrentMonth}
              onAddEvent={handleAddEvent}
              onViewEvent={handleViewEvent}
              onEditEvent={handleEditEvent}
              getShiftForDate={getShiftForDate}
            />
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
