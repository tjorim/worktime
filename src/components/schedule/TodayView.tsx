import { useId, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import clsx from "clsx";
import type { Dayjs } from "dayjs";
import { ShiftBadge } from "../shared/ShiftBadge";
import { DayNavigationButtonGroup } from "../shared/NavigationButtonGroup";
import type { ScheduleOption } from "../../data/rosters";
import { hasMultipleTeams } from "../../utils/scheduleUtils";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { dayjs, getISOWeekYear2Digit } from "../../utils/dateTimeUtils";
import { getLocale } from "../../paraglide/runtime.js";
import type { ShiftResult } from "../../utils/shiftCalculations";
import { getAllTeamsShifts, isCurrentlyWorking } from "../../utils/shiftCalculations";
import { useFormattedShiftTime } from "../../hooks/useFormattedShiftTime";
import * as m from "../../paraglide/messages.js";

interface TodayViewProps {
  myTeam: number | null; // The user's team from onboarding
  currentDate: Dayjs;
  onPreviousDay: () => void;
  onNextDay: () => void;
  onTodayClick: () => void;
  onDateSelect?: (date: Dayjs) => void;
  onTeamClick?: (teamNumber: number, scheduleType: ScheduleOption | null) => void;
  isActive?: boolean;
  viewingScheduleType: ScheduleOption;
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
          <h6 className="mb-0">{hasTeams ? m.team_label({ team: String(shiftResult.teamNumber) }) : m.week_view_schedule_label()}</h6>
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
 * @param onTeamClick - Optional handler invoked with a team number and schedule type when a team card is activated (click or keyboard).
 * @returns A React element representing the Today card containing a responsive grid of team cards and any time-off alerts.
 */
export function TodayView({
  myTeam,
  currentDate,
  onPreviousDay,
  onNextDay,
  onTodayClick,
  onDateSelect,
  onTeamClick,
  isActive = false,
  viewingScheduleType,
}: TodayViewProps) {
  const datePickerId = useId();
  const scheduleType = viewingScheduleType;
  const hasTeams = hasMultipleTeams(viewingScheduleType);

  // Calculate shifts for the viewing schedule
  const todayShifts = useMemo(() => {
    return getAllTeamsShifts(currentDate, viewingScheduleType);
  }, [currentDate, viewingScheduleType]);

  // Keyboard shortcuts (only active when this tab is visible)
  const shortcuts = useMemo(
    () =>
      isActive
        ? {
            onToday: onTodayClick,
            onPrevious: onPreviousDay,
            onNext: onNextDay,
          }
        : {},
    [isActive, onTodayClick, onPreviousDay, onNextDay],
  );
  useKeyboardShortcuts(shortcuts);

  const isCurrentlyActive = (shiftResult: ShiftResult) => {
    if (!shiftResult.shift.isWorking) return false;
    const now = dayjs();
    return isCurrentlyWorking(shiftResult.shift, shiftResult.date, now, scheduleType);
  };

  const today = dayjs();
  const displayDate = currentDate;
  const isToday = displayDate.isSame(today, "day");
  const canSelectDate = Boolean(onDateSelect);
  const handleDateChange = (dateString: string) => {
    if (dateString && onDateSelect) {
      onDateSelect(dayjs(dateString));
    }
  };

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
          <DayNavigationButtonGroup
            isCurrent={isToday}
            onPrevious={onPreviousDay}
            onCurrent={onTodayClick}
            onNext={onNextDay}
            selectorLabel={canSelectDate ? m.tt_jump_to_date() : undefined}
            selectorId={canSelectDate ? datePickerId : undefined}
            selectorValue={canSelectDate ? displayDate.format("YYYY-MM-DD") : undefined}
            onSelectorChange={canSelectDate ? handleDateChange : undefined}
          />
        </div>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="text-muted small">
              {new Intl.DateTimeFormat(getLocale(), { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(displayDate.toDate())}
              {isToday && (
                <Badge bg="success" className="ms-2" aria-label={m.today_view_current_day_aria()}>
                  {m.today()}
                </Badge>
              )}
            </div>
          </div>
          <div className="small text-muted d-none d-lg-block">
            <i className="bi bi-keyboard me-1" aria-hidden="true"></i>
            {m.week_view_keyboard_hint()}
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        <Row className="g-2">
          {todayShifts.map((shiftResult) => (
            <Col key={shiftResult.teamNumber} xs={12} sm={6} md={4} lg>
              <TeamCard
                shiftResult={shiftResult}
                isMyTeam={myTeam === shiftResult.teamNumber}
                isCurrentlyActive={isCurrentlyActive(shiftResult)}
                hasTeams={hasTeams}
                onTeamClick={onTeamClick}
                scheduleType={scheduleType}
              />
            </Col>
          ))}
        </Row>
      </Card.Body>
    </Card>
  );
}
