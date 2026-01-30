import type { Dayjs } from "dayjs";
import { useCallback, useId, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import classNames from "classnames";
import type { ScheduleOption } from "../../data/rosters";
import { useSettings } from "../../contexts/SettingsContext";
import { getScheduleConfig } from "../../utils/scheduleUtils";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import {
  dayjs,
  formatYYWWD,
  getISOWeekYear2Digit,
  getLocalizedShiftTime,
} from "../../utils/dateTimeUtils";
import { calculateShift } from "../../utils/shiftCalculations";

interface ScheduleViewProps {
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
export function ScheduleView({
  myTeam: inputMyTeam,
  currentDate,
  setCurrentDate,
  isActive = false,
  viewingScheduleType: propViewingScheduleType,
}: ScheduleViewProps) {
  const datePickerId = useId();
  const { settings, scheduleType: userScheduleType } = useSettings();

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
          <p className="text-muted mb-3">
            Please select your schedule to view the weekly overview.
          </p>
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

  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0">📅 Schedule Overview</h6>
          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handlePrevious}
              aria-label="Go to previous week"
            >
              <i className="bi bi-chevron-left" aria-hidden="true"></i>
            </Button>
            <Button
              variant={isCurrentWeek ? "primary" : "outline-primary"}
              size="sm"
              onClick={handleCurrent}
              disabled={isCurrentWeek}
              aria-label="Go to current week"
            >
              <i className="bi bi-house me-1" aria-hidden="true"></i>
              This Week
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handleNext}
              aria-label="Go to next week"
            >
              <i className="bi bi-chevron-right" aria-hidden="true"></i>
            </Button>
          </div>
        </div>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="d-flex align-items-center gap-2">
              <Form.Label htmlFor={datePickerId} className="mb-0 small text-muted">
                🎯 Jump to date:
              </Form.Label>
              <Form.Control
                type="date"
                id={datePickerId}
                size="sm"
                value={currentDate.format("YYYY-MM-DD")}
                onChange={(e) => handleDateChange(e.target.value)}
                className="date-picker-auto"
              />
            </div>
          </div>
          <div className="small text-muted d-none d-lg-block">
            ⌨️ Keyboard: ← → arrows, Ctrl+H (this week)
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {myTeam && hasTeams && (
          <div className="mb-3">
            <strong>👥 Team {myTeam} Schedule:</strong>
            <div className="text-muted small">
              Week of {startOfWeek.format("MMM D")} -{" "}
              {startOfWeek.add(6, "day").format("MMM D, YYYY")}
            </div>
          </div>
        )}

        {!hasTeams && (
          <div className="mb-3">
            <strong>📅 Your Schedule:</strong>
            <div className="text-muted small">
              Week of {startOfWeek.format("MMM D")} -{" "}
              {startOfWeek.add(6, "day").format("MMM D, YYYY")}
            </div>
          </div>
        )}

        <div className="table-responsive">
          <Table
            className="schedule-table table-sm"
            aria-label={`Schedule for week of ${startOfWeek.format("MMM D")} - ${startOfWeek.add(6, "day").format("MMM D, YYYY")}`}
          >
            <thead>
              <tr>
                <th className="team-header">{hasTeams ? "Team" : "Schedule"}</th>
                {weekDays.map((day) => {
                  const isToday = day.isSame(dayjs(), "day");
                  return (
                    <th
                      key={day.format("YYYY-MM-DD")}
                      className={classNames("text-center", isToday && "today-column")}
                      aria-label={`${day.format("dddd, MMM D")}${isToday ? " (today)" : ""}`}
                    >
                      <div className="fw-semibold">{day.format("ddd")}</div>
                      <div className="small text-muted">
                        <OverlayTrigger
                          placement="bottom"
                          overlay={
                            <Tooltip id={`date-tooltip-${day.format("YYYY-MM-DD")}`}>
                              <strong>Date Code: {formatYYWWD(day)}</strong>
                              <br />
                              Format: YYWW.D
                              <br />
                              YY = ISO Year {getISOWeekYear2Digit(day)}
                              <br />
                              WW = ISO Week {day.isoWeek()}
                              <br />D = ISO Day {day.isoWeekday()} ({day.format("ddd")})
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
                      ? `Team ${teamNumber}${myTeam === teamNumber ? " (your team)" : ""}`
                      : "Schedule"
                  }
                >
                  <td className="team-header">
                    <strong>{hasTeams ? `Team ${teamNumber}` : "Schedule"}</strong>
                  </td>
                  {weekDays.map((day) => {
                    const shift = calculateShift(day, teamNumber, scheduleType);
                    const isToday = day.isSame(dayjs(), "day");

                    return (
                      <td
                        key={day.format("YYYY-MM-DD")}
                        className={classNames("text-center", isToday && "today-column")}
                        aria-label={
                          hasTeams
                            ? `Team ${teamNumber} on ${day.format("dddd")}: ${shift.isWorking ? shift.name : "Off"}`
                            : `Schedule on ${day.format("dddd")}: ${shift.isWorking ? shift.name : "Off"}`
                        }
                      >
                        {shift.isWorking && (
                          <OverlayTrigger
                            placement="bottom"
                            overlay={
                              <Tooltip
                                id={`schedule-tooltip-${teamNumber}-${day.format("YYYY-MM-DD")}`}
                              >
                                <strong>Shift: {shift.displayCode}</strong>
                                <br />
                                {shift.name} shift
                                <br />
                                <em>
                                  {shift.name} -{" "}
                                  {getLocalizedShiftTime(
                                    shift.start,
                                    shift.end,
                                    settings.timeFormat,
                                  )}
                                </em>
                              </Tooltip>
                            }
                          >
                            <Badge
                              className={classNames("shift-code", "cursor-help", shift.className)}
                            >
                              {shift.displayCode}
                            </Badge>
                          </OverlayTrigger>
                        )}
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
