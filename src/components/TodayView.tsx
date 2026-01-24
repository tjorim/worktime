import { useId, useMemo, useState } from "react";
import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import classNames from "classnames";
import type { Dayjs } from "dayjs";
import type { ScheduleOption } from "../data/rosters";
import { SCHEDULE_OPTIONS } from "../data/rosters";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { getScheduleConfig, isValidScheduleType } from "../utils/scheduleUtils";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { dayjs, getISOWeekYear2Digit } from "../utils/dateTimeUtils";
import type { ShiftResult } from "../utils/shiftCalculations";
import {
  getAllTeamsShifts,
  getShiftDisplay,
  getFormattedShiftTime,
  isCurrentlyWorking,
} from "../utils/shiftCalculations";

interface TodayViewProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onTodayClick: () => void;
  onTeamClick?: (teamNumber: number) => void;
  isActive?: boolean;
}

/**
 * Render a team shift card showing shift details, live status and optional interactivity.
 *
 * Renders a Card displaying team number, shift code badge (with tooltip), shift name and working hours.
 * Shows a live overlay and LIVE badge when the team is currently active. When `onTeamClick` is provided
 * the card is rendered as interactive and invokes the callback with the team number on click or keyboard activation.
 *
 * @param shiftResult - ShiftResult containing team number, shift, date and full code to display
 * @param isMyTeam - Whether this card corresponds to the current user's team (applies "my-team" styling)
 * @param isCurrentlyActive - Whether the team's shift is currently active (controls live overlay and badge)
 * @param onTeamClick - Optional callback invoked with the team number when the card is activated
 * @returns The Card element for the given team and shift; interactive when `onTeamClick` is provided
 */
function TeamCard({
  shiftResult,
  isMyTeam,
  isCurrentlyActive,
  hasTeams,
  onTeamClick,
}: {
  shiftResult: ShiftResult;
  isMyTeam: boolean;
  isCurrentlyActive: boolean;
  hasTeams: boolean;
  onTeamClick?: (teamNumber: number) => void;
}) {
  const { settings, scheduleType } = useSettings();
  // Use shiftResult.shift directly - already contains emoji/className/name/hours
  const shiftDisplay = getShiftDisplay(shiftResult.shift, scheduleType);
  const shiftTimeLabel = getFormattedShiftTime(
    shiftResult.shift,
    scheduleType,
    settings.timeFormat,
  );

  const cardContent = (
    <>
      {isCurrentlyActive && (
        <>
          <div className="live-team-overlay"></div>
          <Badge
            bg="success"
            className="live-badge"
            aria-label={
              hasTeams
                ? `Team ${shiftResult.teamNumber} is currently working`
                : "Schedule is currently working"
            }
          >
            LIVE
          </Badge>
        </>
      )}
      <div
        className="d-flex justify-content-between align-items-center mb-2"
        style={{ position: "relative", zIndex: 2 }}
      >
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0">{hasTeams ? `Team ${shiftResult.teamNumber}` : "Schedule"}</h6>
          {onTeamClick && (
            <i className="bi bi-chevron-right text-muted small" aria-hidden="true"></i>
          )}
        </div>
        <OverlayTrigger
          placement="top"
          overlay={
            <Tooltip id={`shift-tooltip-${shiftResult.teamNumber}`}>
              <strong>Shift Code: {shiftDisplay.displayCode}</strong>
              <br />
              <>
                {shiftResult.shift.emoji} <em>{shiftDisplay.displayName}</em>
                <br />
                {shiftTimeLabel}
              </>
            </Tooltip>
          }
        >
          <Badge className={classNames("shift-code", "cursor-help", shiftResult.shift.className)}>
            {shiftDisplay.displayCode}
          </Badge>
        </OverlayTrigger>
      </div>
      <div className="text-muted small">
        {shiftDisplay.displayName}
        <br />
        {shiftResult.shift.isWorking ? shiftTimeLabel : "Not working today"}
      </div>
      <div className="text-muted small mt-1">
        <OverlayTrigger
          placement="bottom"
          overlay={
            <Tooltip id={`code-tooltip-${shiftResult.teamNumber}`}>
              <strong>Full Shift Code</strong>
              <br />
              Format: YYWW.D + Shift
              <br />
              <em>{shiftResult.code}</em> = ISO Year {getISOWeekYear2Digit(shiftResult.date)}, ISO
              Week {shiftResult.date.isoWeek()}, {shiftResult.date.format("dddd")},{" "}
              {shiftDisplay.displayName}
            </Tooltip>
          }
        >
          <span className="help-underline">{shiftResult.code}</span>
        </OverlayTrigger>
      </div>
    </>
  );

  if (onTeamClick) {
    return (
      <Card
        className={classNames("team-card-interactive", "w-100", isMyTeam && "my-team")}
        onClick={() => onTeamClick(shiftResult.teamNumber)}
        role="button"
        aria-label={
          hasTeams ? `View details for Team ${shiftResult.teamNumber}` : "View schedule details"
        }
        title={
          hasTeams ? `View details for Team ${shiftResult.teamNumber}` : "View schedule details"
        }
        style={{ cursor: "pointer" }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTeamClick(shiftResult.teamNumber);
          }
        }}
      >
        <Card.Body className="p-3">{cardContent}</Card.Body>
      </Card>
    );
  }

  return (
    <Card className={isMyTeam ? "my-team" : ""}>
      <Card.Body className="p-3">{cardContent}</Card.Body>
    </Card>
  );
}

/**
 * Render a card listing all teams scheduled for the given date, with date navigation and optional per-team interactivity.
 *
 * Works with any schedule type - automatically adapts to single-user or multi-team schedules. Shifts are calculated
 * internally based on the selected viewing schedule, supporting cross-schedule viewing functionality.
 *
 * @param myTeam - Current user's team number, or `null`; used to visually highlight the user's team card.
 * @param currentDate - The date being displayed
 * @param onPreviousDay - Handler invoked when the "Previous" button is pressed
 * @param onNextDay - Handler invoked when the "Next" button is pressed
 * @param onTodayClick - Handler invoked when the "Today" button is pressed.
 * @param onTeamClick - Optional handler invoked with a team number when a team card is activated (click or keyboard).
 * @returns A React element representing the Today card containing a responsive grid of team cards and any time-off alerts.
 */
export function TodayView({
  myTeam,
  currentDate,
  onPreviousDay,
  onNextDay,
  onTodayClick,
  onTeamClick,
  isActive = true,
}: TodayViewProps) {
  const scheduleSelectId = useId();
  const { getEventsInRange } = useEventStore();
  const { scheduleType: userScheduleType } = useSettings();

  // Cross-schedule viewing: allow viewing other schedule types
  const [viewingScheduleType, setViewingScheduleType] = useState<ScheduleOption | null>(
    userScheduleType,
  );

  // Use viewing schedule for calculations
  const scheduleType = viewingScheduleType || userScheduleType;
  const hasTeams = getScheduleConfig(scheduleType).showsTeamSelection;

  // Get available schedules for the selector
  const availableSchedules = SCHEDULE_OPTIONS.filter((s) => s.isAvailable);

  // Calculate shifts for the viewing schedule
  const todayShifts = useMemo(() => {
    return getAllTeamsShifts(currentDate, scheduleType);
  }, [currentDate, scheduleType]);

  // Keyboard shortcuts (only active when this tab is visible)
  useKeyboardShortcuts(
    isActive
      ? {
          onToday: onTodayClick,
          onPrevious: onPreviousDay,
          onNext: onNextDay,
        }
      : {},
  );

  const isCurrentlyActive = (shiftResult: ShiftResult) => {
    if (!shiftResult.shift.isWorking) return false;
    const now = dayjs();
    return isCurrentlyWorking(shiftResult.shift, shiftResult.date, now);
  };

  // Get events for the current date
  const today = dayjs();
  const displayDate = currentDate;
  const isToday = displayDate.isSame(today, "day");
  const todayStart = displayDate.toDate();
  const todayEnd = displayDate.toDate();
  const todayEvents = getEventsInRange(todayStart, todayEnd);

  return (
    <Card>
      <Card.Header>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <h6 className="mb-0">{hasTeams ? "👥 All Teams" : "📅 Schedule"}</h6>
          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onPreviousDay}
              aria-label="Go to previous day"
            >
              <i className="bi bi-chevron-left" aria-hidden="true"></i>
            </Button>
            <Button
              variant={isToday ? "primary" : "outline-primary"}
              size="sm"
              onClick={onTodayClick}
              disabled={isToday}
              aria-label="Go to today"
            >
              <i className="bi bi-calendar-check me-1" aria-hidden="true"></i>
              Today
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onNextDay}
              aria-label="Go to next day"
            >
              <i className="bi bi-chevron-right" aria-hidden="true"></i>
            </Button>
          </div>
        </div>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Form.Label htmlFor={scheduleSelectId} className="mb-0 small text-muted">
              📋 View schedule:
            </Form.Label>
            <Form.Select
              id={scheduleSelectId}
              size="sm"
              value={viewingScheduleType || ""}
              onChange={(e) => {
                const value = e.target.value;
                setViewingScheduleType(isValidScheduleType(value) ? value : null);
              }}
              style={{ width: "auto" }}
            >
              {availableSchedules.map((schedule) => (
                <option key={schedule.value} value={schedule.value}>
                  {schedule.title}
                  {schedule.value === userScheduleType ? " (Your schedule)" : ""}
                </option>
              ))}
            </Form.Select>
          </div>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="text-muted small">
              {displayDate.format("dddd, MMMM D, YYYY")}
              {isToday && (
                <Badge bg="success" className="ms-2">
                  Today
                </Badge>
              )}
            </div>
            <div className="small text-muted d-none d-lg-block">
              ⌨️ Keyboard: ← → arrows, Ctrl+H (today)
            </div>
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {todayEvents.length > 0 && (
          <Alert variant="info" className="mb-3">
            <i className="bi bi-calendar-check me-2"></i>
            <strong>Time-off event{todayEvents.length > 1 ? "s" : ""} today:</strong>
            <ul className="mb-0 mt-2">
              {todayEvents.map((event) => (
                <li key={event.id}>{event.label || "Time off"}</li>
              ))}
            </ul>
          </Alert>
        )}
        <Row className="g-2">
          {todayShifts.map((shiftResult) => (
            <Col key={shiftResult.teamNumber} xs={12} sm={6} md={4} lg>
              <TeamCard
                shiftResult={shiftResult}
                isMyTeam={myTeam === shiftResult.teamNumber}
                isCurrentlyActive={isCurrentlyActive(shiftResult)}
                hasTeams={hasTeams}
                onTeamClick={onTeamClick}
              />
            </Col>
          ))}
        </Row>
      </Card.Body>
    </Card>
  );
}
