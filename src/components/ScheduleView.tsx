import type { Dayjs } from "dayjs";
import { useId } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Table from "react-bootstrap/Table";
import Tooltip from "react-bootstrap/Tooltip";
import { useSettings } from "../contexts/SettingsContext";
import { SCHEDULE_OPTIONS } from "../data/rosters";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import {
  dayjs,
  formatYYWWD,
  getISOWeekYear2Digit,
  getLocalizedShiftTime,
} from "../utils/dateTimeUtils";
import { calculateShift, getShiftByCode } from "../utils/shiftCalculations";

interface ScheduleViewProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  setCurrentDate: (date: Dayjs) => void;
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
export function ScheduleView({
  myTeam: inputMyTeam,
  currentDate,
  setCurrentDate,
}: ScheduleViewProps) {
  const datePickerId = useId();
  const { settings, scheduleOption } = useSettings();
  const scheduleConfig =
    SCHEDULE_OPTIONS.find((option) => option.value === (scheduleOption ?? "5-shift")) ??
    SCHEDULE_OPTIONS.find((option) => option.value === "5-shift")!;
  const teamCount = scheduleConfig.shiftConfig.teamCount ?? 1;
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

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onToday: handleCurrent,
    onPrevious: handlePrevious,
    onNext: handleNext,
  });

  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0">📅 Schedule Overview</h6>
          <ButtonGroup aria-label="Week navigation">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={handlePrevious}
              aria-label="Go to previous week"
            >
              <i className="bi bi-chevron-left me-1" aria-hidden="true"></i>
              Previous
            </Button>
            <Button
              variant="outline-primary"
              size="sm"
              onClick={handleCurrent}
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
              Next
              <i className="bi bi-chevron-right ms-1" aria-hidden="true"></i>
            </Button>
          </ButtonGroup>
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
        {myTeam && (
          <div className="mb-3">
            <strong>👥 Team {myTeam} Schedule:</strong>
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
                <th className="team-header">Team</th>
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
                  aria-label={`Team ${teamNumber}${myTeam === teamNumber ? " (your team)" : ""}`}
                >
                  <td className="team-header">
                    <strong>Team {teamNumber}</strong>
                  </td>
                  {weekDays.map((day) => {
                    const shift = calculateShift(day, teamNumber, scheduleOption ?? undefined);
                    const isToday = day.isSame(dayjs(), "day");

                    return (
                      <td
                        key={day.format("YYYY-MM-DD")}
                        className={`text-center ${isToday ? "today-column" : ""}`}
                        aria-label={`Team ${teamNumber} on ${day.format("dddd")}: ${shift.isWorking ? shift.name : "Off"}`}
                      >
                        {shift.isWorking && (
                          <OverlayTrigger
                            placement="bottom"
                            overlay={
                              <Tooltip
                                id={`schedule-tooltip-${teamNumber}-${day.format("YYYY-MM-DD")}`}
                              >
                                <strong>Shift: {shift.code}</strong>
                                <br />
                                {shift.code === "M" && "Morning shift"}
                                {shift.code === "E" && "Evening shift"}
                                {shift.code === "N" && "Night shift"}
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
                              className={`shift-code cursor-help ${getShiftByCode(shift.code).className}`}
                            >
                              {shift.code}
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
