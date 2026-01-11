import type { Dayjs } from "dayjs";
import { useId } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import { useSettings } from "../contexts/SettingsContext";
import { getScheduleConfig } from "../utils/scheduleUtils";
import { useScheduleConfig } from "../hooks/useScheduleConfig";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import {
  dayjs,
  formatYYWWD,
  getISOWeekYear2Digit,
  getLocalizedShiftTime,
} from "../utils/dateTimeUtils";
import { calculateShift, getShiftByCode, getShiftDisplay } from "../utils/shiftCalculations";

interface ScheduleViewProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
  isActive?: boolean;
}

/**
 * Render the weekly schedule overview for all teams, with navigation, date jump and keyboard shortcuts.
 *
 * Validates the provided `myTeam` and treats out-of-range team numbers as no team selected.
 *
 * @param myTeam - The user's team number from onboarding, or `null` if none is set
 * @param currentDate - The date used to determine which week is displayed
 * @param setCurrentDate - Callback to update the displayed date
 * @returns The rendered schedule overview component
 */
function ScheduleViewFiveShift({
  myTeam: inputMyTeam,
  currentDate,
  setCurrentDate,
  isActive = true,
}: ScheduleViewProps) {
  const datePickerId = useId();
  const { settings, scheduleType } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const teamCount = scheduleConfig.shiftConfig.teamCount ?? 1;
  const hasTeams = scheduleConfig.showsTeamSelection ?? true;
  // Validate and sanitize myTeam prop
  let myTeam = inputMyTeam;
  if (typeof myTeam === "number" && (myTeam < 1 || myTeam > teamCount)) {
    console.warn(`Invalid team number: ${myTeam}. Expected 1-${teamCount}`);
    myTeam = null;
  }
  const isMyTeam = (teamNumber: number) => {
    return myTeam === teamNumber ? "my-team" : "";
  };

  const handlePrevious = () => {
    setCurrentDate(currentDate.subtract(7, "day"));
  };

  const handleNext = () => {
    setCurrentDate(currentDate.add(7, "day"));
  };

  const handleCurrent = () => {
    setCurrentDate(dayjs());
  };

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
  useKeyboardShortcuts(
    isActive
      ? {
          onToday: handleCurrent,
          onPrevious: handlePrevious,
          onNext: handleNext,
        }
      : {},
  );

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
        <div className="d-flex justify-content-between align-items-center gap-3">
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
          <div className="small text-muted text-end" style={{ minWidth: "180px" }}>
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
                      className={`text-center ${isToday ? "today-column" : ""}`}
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
                    const shiftDisplay = getShiftDisplay(shift, scheduleType);

                    return (
                      <td
                        key={day.format("YYYY-MM-DD")}
                        className={`text-center ${isToday ? "today-column" : ""}`}
                        aria-label={
                          hasTeams
                            ? `Team ${teamNumber} on ${day.format("dddd")}: ${shift.isWorking ? shiftDisplay.displayName : "Off"}`
                            : `Schedule on ${day.format("dddd")}: ${shift.isWorking ? shiftDisplay.displayName : "Off"}`
                        }
                      >
                        {shift.isWorking && (
                          <OverlayTrigger
                            placement="bottom"
                            overlay={
                              <Tooltip
                                id={`schedule-tooltip-${teamNumber}-${day.format("YYYY-MM-DD")}`}
                              >
                                <strong>Shift: {shiftDisplay.displayCode}</strong>
                                <br />
                                {shiftDisplay.displayName} shift
                                <br />
                                <em>
                                  {shiftDisplay.displayName} -{" "}
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
                              className={`shift-code cursor-help ${getShiftByCode(shift.code).className}`}
                            >
                              {shiftDisplay.displayCode}
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

export function ScheduleView(props: ScheduleViewProps) {
  const { scheduleConfig, isFiveShift } = useScheduleConfig();

  if (!isFiveShift) {
    return (
      <Card>
        <Card.Header>
          <div className="d-flex justify-content-between align-items-center">
            <h6 className="mb-0">📅 Schedule Overview</h6>
          </div>
        </Card.Header>
        <Card.Body>
          <p className="text-muted mb-0">
            Schedule type selected: {scheduleConfig.title}. Weekly team schedules are available for
            5-shift schedules.
          </p>
        </Card.Body>
      </Card>
    );
  }

  return <ScheduleViewFiveShift {...props} />;
}
