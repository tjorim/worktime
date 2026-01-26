import { useMemo, useState } from "react";
import Card from "react-bootstrap/Card";
import type { Dayjs } from "dayjs";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { dayjs } from "../utils/dateTimeUtils";
import { usePublicHolidays } from "../hooks/usePublicHolidays";
import { useSchoolHolidays } from "../hooks/useSchoolHolidays";
import { getMonthlyPaydayMap } from "../utils/paydayUtils";
import { WorkingScheduleCalendar } from "./calendar/WorkingScheduleCalendar";

interface CalendarViewProps {
  myTeam: number | null;
  isActive?: boolean;
}

/**
 * CalendarView displays a monthly calendar showing the user's working schedule.
 *
 * This view integrates:
 * - User's roster schedule (shift pattern)
 * - Time-off events from event store
 * - Public holidays (with shift-specific logic)
 * - School holidays
 * - Paydays
 *
 * Key Features:
 * - Shows working vs. non-working days based on schedule
 * - Indicates shift types for working days
 * - Marks time-off events and public holidays
 * - For night shifts: uses "majority of hours" rule for public holidays
 *
 * Accessibility:
 * - ARIA labels for navigation and interactive elements
 * - Keyboard navigation support
 * - Screen reader friendly calendar structure
 *
 * @param props.myTeam - The user's team number from onboarding or null
 * @param props.isActive - Whether this tab is currently active
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
            <WorkingScheduleCalendar
              myTeam={myTeam}
              scheduleType={scheduleType}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              events={events}
              publicHolidays={publicHolidayMap}
              schoolHolidays={schoolHolidayMap}
              paydayMap={paydayMapForYear}
            />
          )}
        </Card.Body>
      </Card>
    </div>
  );
}
