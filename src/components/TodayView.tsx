import Alert from "react-bootstrap/Alert";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import { useEventStore } from "../contexts/EventStoreContext";
import { useSettings } from "../contexts/SettingsContext";
import { getScheduleConfig } from "../utils/scheduleUtils";
import { dayjs, getISOWeekYear2Digit } from "../utils/dateTimeUtils";
import type { ShiftResult } from "../utils/shiftCalculations";
import { getShiftByCode, getShiftDisplay, getFormattedShiftTime, isCurrentlyWorking } from "../utils/shiftCalculations";

interface TodayViewProps {
  todayShifts: ShiftResult[];
  myTeam: number | null; // The user's team from onboarding
  onTodayClick: () => void;
  onTeamClick?: (teamNumber: number) => void;
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
  const { settings, scheduleOption } = useSettings();
  // Use shiftResult.shift directly - already contains emoji/className/name/hours
  const shiftDisplay = getShiftDisplay(shiftResult.shift, scheduleOption);
  const shiftTimeLabel = getFormattedShiftTime(shiftResult.shift, scheduleOption, settings.timeFormat);

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
          <Badge className={`shift-code cursor-help ${shiftResult.shift.className}`}>
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
        className={`team-card-interactive w-100${isMyTeam ? " my-team" : ""}`}
        onClick={() => onTeamClick(shiftResult.teamNumber)}
        role="button"
        aria-label={
          hasTeams
            ? `View details for Team ${shiftResult.teamNumber}`
            : "View schedule details"
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
 * Render a card listing all teams scheduled for today, with an optional Today action and per-team interactivity.
 *
 * @param todayShifts - Array of shift results for today; each item represents a team's scheduled shift and metadata.
 * @param myTeam - Current user's team number, or `null`; used to visually highlight the user's team card.
 * @param onTodayClick - Handler invoked when the "Today" button is pressed.
 * @param onTeamClick - Optional handler invoked with a team number when a team card is activated (click or keyboard).
 * @returns A React element representing the Today card containing a responsive grid of team cards and any time-off alerts.
 */
export function TodayView({ todayShifts, myTeam, onTodayClick, onTeamClick }: TodayViewProps) {
  const { getEventsInRange } = useEventStore();
  const { scheduleOption } = useSettings();
  const hasTeams = getScheduleConfig(scheduleOption).showsTeamSelection ?? true;

  const isCurrentlyActive = (shiftResult: ShiftResult) => {
    if (!shiftResult.shift.isWorking) return false;
    const now = dayjs();
    return isCurrentlyWorking(shiftResult.shift, shiftResult.date, now);
  };

  // Get events for today
  const today = dayjs();
  const todayStart = today.toDate();
  const todayEnd = today.toDate();
  const todayEvents = getEventsInRange(todayStart, todayEnd);

  return (
    <Card>
      <Card.Header className="d-flex justify-content-between align-items-center">
        <h6 className="mb-0">{hasTeams ? "👥 All Teams Today" : "📅 Today's Schedule"}</h6>
        <Button variant="outline-primary" size="sm" onClick={onTodayClick}>
          <i className="bi bi-calendar-check me-1" aria-hidden="true"></i>
          Today
        </Button>
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
