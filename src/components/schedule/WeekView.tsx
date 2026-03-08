import type { Dayjs } from "dayjs";
import { useCallback, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import clsx from "clsx";
import type { ScheduleOption } from "../../data/rosters";
import { useSettings } from "../../contexts/SettingsContext";
import { getScheduleConfig } from "../../utils/scheduleUtils";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { dayjs, formatYYWWD, getISOWeekYear2Digit } from "../../utils/dateTimeUtils";
import { calculateShift } from "../../utils/shiftCalculations";
import { getLocale } from "../../paraglide/runtime.js";
import { ShiftBadge } from "../shared/ShiftBadge";
import { WeekNavigationButtonGroup } from "../shared/NavigationButtonGroup";
import * as m from "../../paraglide/messages.js";

interface WeekViewProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  isActive?: boolean;
  viewingScheduleType?: ScheduleOption | null;
}

/**
 * Render the weekly schedule overview for all teams, with navigation, date jump and keyboard shortcuts.
 *
 * Works with any schedule type - automatically adapts to single-user or multi-team schedules.
 * Validates the provided `myTeam` and treats out-of-range team numbers as no team selected.
 *
 * @param myTeam - The user's team number from onboarding, or `null` if none is set
 * @param currentDate - The date used to determine which week is displayed
 * @param setCurrentDate - Callback to update the displayed date
 * @returns The rendered schedule overview component
 */
export function WeekView({
  myTeam: inputMyTeam,
  currentDate,
  setCurrentDate,
  isActive = false,
  viewingScheduleType: propViewingScheduleType,
}: WeekViewProps) {
  const { scheduleType: userScheduleType } = useSettings();

  // Use prop if provided, otherwise fall back to user's schedule type
  const scheduleType = propViewingScheduleType ?? userScheduleType;

  const handlePrevious = useCallback(() => {
    setCurrentDate(currentDate.subtract(7, "day"));
  }, [currentDate, setCurrentDate]);

  const handleNext = useCallback(() => {
    setCurrentDate(currentDate.add(7, "day"));
  }, [currentDate, setCurrentDate]);

  const handleCurrent = useCallback(() => {
    setCurrentDate(dayjs());
  }, [setCurrentDate]);

  const handleDateChange = (dateString: string) => {
    if (dateString) {
      setCurrentDate(dayjs(dateString));
    }
  };

  // Generate Monday-Sunday week containing the current date
  const startOfWeek = currentDate.startOf("isoWeek"); // Monday (ISO week)
  const weekDays = Array.from({ length: 7 }, (_, i) => startOfWeek.add(i, "day"));
  const selectedWeekNumber = startOfWeek.add(0, "day").isoWeek();
  const selectedWeekYear = startOfWeek.isoWeekYear();

  // Check if we're viewing the current week
  const currentWeekStart = dayjs().startOf("isoWeek");
  const isCurrentWeek = startOfWeek.isSame(currentWeekStart, "day");

  // Keyboard shortcuts (only active when this tab is visible)
  const shortcuts = useMemo(
    () =>
      isActive
        ? {
            onToday: handleCurrent,
            onPrevious: handlePrevious,
            onNext: handleNext,
          }
        : {},
    [isActive, handleCurrent, handlePrevious, handleNext],
  );
  useKeyboardShortcuts(shortcuts);

  // No schedule selected - show setup prompt
  if (!scheduleType) {
    return (
      <Card>
        <Card.Body className="text-center py-4">
          <i className="bi bi-calendar-plus text-muted mb-3 icon-lg" aria-hidden="true"></i>
          <p className="text-muted mb-3">{m.week_view_no_schedule()}</p>
        </Card.Body>
      </Card>
    );
  }

  const scheduleConfig = getScheduleConfig(scheduleType);
  const teamCount = scheduleConfig.shiftConfig.teamCount;
  const hasTeams = teamCount > 1;
  // Validate and sanitize myTeam prop
  let myTeam = inputMyTeam;
  if (typeof myTeam === "number" && (myTeam < 1 || myTeam > teamCount)) {
    console.warn(`Invalid team number: ${myTeam}. Expected 1-${teamCount}`);
    myTeam = null;
  }
  const isMyTeam = (teamNumber: number) => {
    return myTeam === teamNumber ? "my-team" : "";
  };

  // Memoize today's date for consistent "today" highlighting throughout rendering
  const today = dayjs();
  const locale = getLocale();
  const shortDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }),
    [locale],
  );
  const longDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "long", month: "short", day: "numeric" }),
    [locale],
  );
  const shortWeekdayFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );

  const formatShortDate = (value: Dayjs) => shortDateFormatter.format(dayjs(value).toDate());
  const formatLongDate = (value: Dayjs) => longDateFormatter.format(dayjs(value).toDate());
  const formatShortWeekday = (value: Dayjs) => shortWeekdayFormatter.format(dayjs(value).toDate());

  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="fw-semibold">
            <i
              className={`bi ${hasTeams ? "bi-people" : "bi-calendar2"} me-2`}
              aria-hidden="true"
            ></i>
            {hasTeams ? m.week_view_all_teams() : m.week_view_schedule_label()}
          </span>
          <WeekNavigationButtonGroup
            isCurrent={isCurrentWeek}
            onPrevious={handlePrevious}
            onCurrent={handleCurrent}
            onNext={handleNext}
            selectorLabel={m.tt_jump_to_date()}
            selectorValue={currentDate.format("YYYY-MM-DD")}
            onSelectorChange={handleDateChange}
          />
        </div>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="text-muted small">
            {m.week_label({ week: String(selectedWeekNumber), year: String(selectedWeekYear) })}
            {isCurrentWeek && (
              <Badge bg="success" className="ms-2" aria-label={m.this_week()}>
                {m.this_week()}
              </Badge>
            )}
          </div>
          <div className="small text-muted d-none d-lg-block">
            <i className="bi bi-keyboard me-1" aria-hidden="true"></i>
            {m.week_view_keyboard_hint()}
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {myTeam && hasTeams && (
          <div className="mb-3">
            <strong>
              <i className="bi bi-people me-1" aria-hidden="true"></i>
              {m.week_view_team_schedule_heading({ team: String(myTeam) })}
            </strong>
            <div className="text-muted small">{m.week_number({ week: String(selectedWeekNumber) })}</div>
          </div>
        )}

        {!hasTeams && (
          <div className="mb-3">
            <strong>
              <i className="bi bi-calendar2 me-1" aria-hidden="true"></i>
              {m.week_view_your_schedule_heading()}
            </strong>
            <div className="text-muted small">{m.week_number({ week: String(selectedWeekNumber) })}</div>
          </div>
        )}

        <div className="table-responsive">
          <Table
            className="schedule-table table-sm"
            aria-label={m.week_view_table_aria({
              startDate: formatShortDate(startOfWeek),
              endDate: formatShortDate(startOfWeek.add(6, "day")),
            })}
          >
            <thead>
              <tr>
                <th className="team-header">
                  {hasTeams ? m.week_view_team_header() : m.week_view_schedule_label()}
                </th>
                {weekDays.map((day, dayIndex) => {
                  const isToday = day.isSame(today, "day");
                  return (
                    <th
                      key={`day-header-${dayIndex}-${day.format("YYYY-MM-DD")}`}
                      className={clsx("text-center", isToday && "today-column")}
                      aria-label={m.week_view_day_header_aria({
                        date: formatLongDate(day),
                        today: isToday ? m.daycell_today_label() : "",
                      })}
                    >
                      <div className="fw-semibold">{formatShortWeekday(day)}</div>
                      <div className="small text-muted">
                        <OverlayTrigger
                          placement="bottom"
                          overlay={
                            <Tooltip id={`date-tooltip-${day.format("YYYY-MM-DD")}`}>
                              <strong>{m.week_view_date_code({ code: formatYYWWD(day) })}</strong>
                              <br />
                              {m.week_view_date_code_format()}
                              <br />
                              {m.week_view_iso_year({ year: getISOWeekYear2Digit(day) })}
                              <br />
                              {m.week_view_iso_week({ week: String(day.isoWeek()) })}
                              <br />
                              {m.week_view_iso_day({
                                day: String(day.isoWeekday()),
                                weekday: formatShortWeekday(day),
                              })}
                            </Tooltip>
                          }
                        >
                          <span className="help-underline">{formatYYWWD(day)}</span>
                        </OverlayTrigger>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: teamCount }, (_, i) => i + 1).map((teamNumber) => (
                <tr
                  key={teamNumber}
                  className={isMyTeam(teamNumber)}
                  aria-label={
                    hasTeams
                      ? m.week_view_team_row_aria({
                          team: String(teamNumber),
                          yourTeam: myTeam === teamNumber ? m.week_view_your_team_suffix() : "",
                        })
                      : m.week_view_schedule_label()
                  }
                >
                  <td className="team-header">
                    <strong>
                      {hasTeams ? m.team_label({ team: String(teamNumber) }) : m.week_view_schedule_label()}
                    </strong>
                  </td>
                  {weekDays.map((day, dayIndex) => {
                    const shift = calculateShift(day, teamNumber, scheduleType);
                    const isToday = day.isSame(today, "day");

                    return (
                      <td
                        key={`team-${teamNumber}-day-${dayIndex}-${day.format("YYYY-MM-DD")}`}
                        className={clsx("text-center", isToday && "today-column")}
                        aria-label={
                          hasTeams
                            ? m.week_view_team_day_shift_aria({
                                team: String(teamNumber),
                                day: formatLongDate(day),
                                shift: shift.isWorking ? shift.name : m.schedule_off(),
                              })
                            : m.week_view_schedule_day_shift_aria({
                                day: formatLongDate(day),
                                shift: shift.isWorking ? shift.name : m.schedule_off(),
                              })
                        }
                      >
                        {shift.isWorking && <ShiftBadge shift={shift} />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card.Body>
    </Card>
  );
}
