import { useId } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import clsx from "clsx";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import { hasMultipleTeams, isValidScheduleType } from "@/utils/scheduleUtils";
import { dayjs, getISOWeekYear2Digit } from "@/utils/dateTimeUtils";
import { getLocale } from "@/paraglide/runtime.js";
import type { ShiftResult } from "@/utils/shiftCalculations";
import { getAllTeamsShifts, isCurrentlyWorking } from "@/utils/shiftCalculations";
import { useFormattedShiftTime } from "@/hooks/useFormattedShiftTime";
import * as m from "@/paraglide/messages.js";

// Pre-compute available schedules since SCHEDULE_OPTIONS is static
const availableSchedules = SCHEDULE_OPTIONS.filter((s) => s.isAvailable);

interface TodayViewProps {
  myTeam: number | null; // The user's team from onboarding
  onTeamClick?: (teamNumber: number, scheduleType: ScheduleOption | null) => void;
  viewingScheduleType: ScheduleOption | null;
  userScheduleType: ScheduleOption | null;
  onViewingScheduleTypeChange: (next: ScheduleOption | null) => void;
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
 * @param onTeamClick - Optional callback invoked with the team number and schedule type when the card is activated
 * @returns The Card element for the given team and shift; interactive when `onTeamClick` is provided
 */
function TeamCard({
  shiftResult,
  isMyTeam,
  isCurrentlyActive,
  hasTeams,
  onTeamClick,
  scheduleType,
}: {
  shiftResult: ShiftResult;
  isMyTeam: boolean;
  isCurrentlyActive: boolean;
  hasTeams: boolean;
  onTeamClick?: (teamNumber: number, scheduleType: ScheduleOption | null) => void;
  scheduleType: ScheduleOption;
}) {
  // Use shiftResult.shift directly - already contains emoji/className/name/displayCode
  const shift = shiftResult.shift;
  const shiftTimeLabel = useFormattedShiftTime(shift);

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
                ? m.schedule_team_working_aria({ team: String(shiftResult.teamNumber) })
                : m.schedule_working_aria()
            }
          >
            {m.today_view_live_badge()}
          </Badge>
        </>
      )}
      <div className="team-card-header d-flex justify-content-between align-items-center mb-2">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0">
            {hasTeams
              ? m.team_label({ team: String(shiftResult.teamNumber) })
              : m.week_view_schedule_label()}
          </h6>
          {onTeamClick && (
            <i className="bi bi-chevron-right text-muted small" aria-hidden="true"></i>
          )}
        </div>
        <ShiftBadge shift={shift} />
      </div>
      <div className="text-muted small">
        {shift.name}
        <br />
        {shift.isWorking ? shiftTimeLabel : m.schedule_not_working_today()}
      </div>
      <div className="text-muted small mt-1">
        <OverlayTrigger
          placement="bottom"
          overlay={
            <Tooltip id={`code-tooltip-${shiftResult.teamNumber}`}>
              <strong>{m.shift_full_code_title()}</strong>
              <br />
              {m.shift_code_format()}
              <br />
              {m.today_view_shift_full_code_tooltip({
                code: shiftResult.code,
                isoYear: getISOWeekYear2Digit(shiftResult.date),
                isoWeek: String(shiftResult.date.isoWeek()),
                weekday: new Intl.DateTimeFormat(getLocale(), { weekday: "long" }).format(
                  shiftResult.date.toDate(),
                ),
                shift: shift.name,
              })}
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
        className={clsx("team-card-interactive", "w-100", isMyTeam && "my-team")}
        onClick={() => onTeamClick(shiftResult.teamNumber, scheduleType)}
        role="button"
        aria-label={
          hasTeams
            ? m.today_view_team_details_aria({ team: String(shiftResult.teamNumber) })
            : m.week_view_schedule_label()
        }
        title={
          hasTeams
            ? m.today_view_team_details_aria({ team: String(shiftResult.teamNumber) })
            : m.week_view_schedule_label()
        }
        style={{ cursor: "pointer" }}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onTeamClick(shiftResult.teamNumber, scheduleType);
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
 * Render a card listing all teams scheduled for today, with a schedule selector and optional
 * per-team interactivity. Today always reflects the actual current date — it has no date
 * navigation of its own (see WeekView for browsing other days/weeks).
 *
 * Works with any schedule type - automatically adapts to single-user or multi-team schedules. Shifts are calculated
 * internally based on the selected viewing schedule, supporting cross-schedule viewing functionality.
 *
 * @param myTeam - Current user's team number, or `null`; used to visually highlight the user's team card.
 * @param onTeamClick - Optional handler invoked with a team number and schedule type when a team card is activated (click or keyboard).
 * @param viewingScheduleType - The schedule currently being browsed, or `null` if none is selected yet.
 * @param userScheduleType - The user's own schedule, used to mark it in the selector.
 * @param onViewingScheduleTypeChange - Callback invoked when the schedule selector changes.
 * @returns A React element representing the Today card containing a schedule selector and a responsive grid of team cards.
 */
export function TodayView({
  myTeam,
  onTeamClick,
  viewingScheduleType,
  userScheduleType,
  onViewingScheduleTypeChange,
}: TodayViewProps) {
  const scheduleSelectId = useId();
  const hasTeams = viewingScheduleType ? hasMultipleTeams(viewingScheduleType) : false;
  const today = dayjs();

  // Calculate shifts for the viewing schedule
  const todayShifts = viewingScheduleType ? getAllTeamsShifts(today, viewingScheduleType) : [];

  const isCurrentlyActive = (shiftResult: ShiftResult) => {
    if (!viewingScheduleType || !shiftResult.shift.isWorking) return false;
    return isCurrentlyWorking(shiftResult.shift, shiftResult.date, dayjs(), viewingScheduleType);
  };

  return (
    <Card>
      <Card.Header>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2 mb-2">
          <span className="fw-semibold">
            <i
              className={`bi ${hasTeams ? "bi-people" : "bi-calendar2"} me-2`}
              aria-hidden="true"
            ></i>
            {hasTeams ? m.week_view_all_teams() : m.week_view_schedule_label()}
          </span>
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <Form.Label htmlFor={scheduleSelectId} className="mb-0 small text-muted">
              <i className="bi bi-clipboard-list me-1" aria-hidden="true"></i>
              {m.schedule_view_label()}
            </Form.Label>
            <Form.Select
              id={scheduleSelectId}
              size="sm"
              value={viewingScheduleType || ""}
              onChange={(e) => {
                const value = e.target.value;
                onViewingScheduleTypeChange(isValidScheduleType(value) ? value : null);
              }}
              style={{ width: "auto" }}
            >
              <option value="" disabled>
                {m.schedule_select_placeholder()}
              </option>
              {availableSchedules.map((schedule) => (
                <option key={schedule.value} value={schedule.value}>
                  {schedule.title}
                  {schedule.value === userScheduleType
                    ? ` ${m.schedule_your_schedule_suffix()}`
                    : ""}
                </option>
              ))}
            </Form.Select>
          </div>
        </div>
        {viewingScheduleType && (
          <div className="text-muted small">
            {new Intl.DateTimeFormat(getLocale(), {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            }).format(today.toDate())}
            <Badge bg="success" className="ms-2" aria-label={m.today_view_current_day_aria()}>
              {m.today()}
            </Badge>
          </div>
        )}
      </Card.Header>
      <Card.Body>
        {!viewingScheduleType ? (
          <div className="alert alert-info mb-0" role="status">
            {m.schedule_select_hint()}
          </div>
        ) : (
          <Row className="g-2">
            {todayShifts.map((shiftResult) => (
              <Col key={shiftResult.teamNumber} xs={12} sm={6} md={4} lg>
                <TeamCard
                  shiftResult={shiftResult}
                  isMyTeam={myTeam === shiftResult.teamNumber}
                  isCurrentlyActive={isCurrentlyActive(shiftResult)}
                  hasTeams={hasTeams}
                  onTeamClick={onTeamClick}
                  scheduleType={viewingScheduleType}
                />
              </Col>
            ))}
          </Row>
        )}
      </Card.Body>
    </Card>
  );
}
