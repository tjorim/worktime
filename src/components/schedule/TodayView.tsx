import { type TouchEvent, useCallback, useEffect, useId, useMemo, useState } from "react";
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
import type { ShiftResult } from "../../utils/shiftCalculations";
import { getAllTeamsShifts, isCurrentlyWorking } from "../../utils/shiftCalculations";
import { useFormattedShiftTime } from "../../hooks/useFormattedShiftTime";
import { useIsMobile } from "../../hooks/useIsMobile";

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
                ? `Team ${shiftResult.teamNumber} is currently working`
                : "Schedule is currently working"
            }
          >
            LIVE
          </Badge>
        </>
      )}
      <div className="team-card-header d-flex justify-content-between align-items-center mb-2">
        <div className="d-flex align-items-center gap-2">
          <h6 className="mb-0">{hasTeams ? `Team ${shiftResult.teamNumber}` : "Schedule"}</h6>
          {onTeamClick && (
            <i className="bi bi-chevron-right text-muted small" aria-hidden="true"></i>
          )}
        </div>
        <ShiftBadge shift={shift} />
      </div>
      <div className="text-muted small">
        {shift.name}
        <br />
        {shift.isWorking ? shiftTimeLabel : "Not working today"}
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
              Week {shiftResult.date.isoWeek()}, {shiftResult.date.format("dddd")}, {shift.name}
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
  const isMobile = useIsMobile();
  const [mobileActiveIndex, setMobileActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

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

  useEffect(() => {
    const preferredIndex = todayShifts.findIndex((shiftResult) => shiftResult.teamNumber === myTeam);
    setMobileActiveIndex(preferredIndex >= 0 ? preferredIndex : 0);
  }, [myTeam, todayShifts]);

  const goToPreviousTeam = useCallback(() => {
    setMobileActiveIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const goToNextTeam = useCallback(() => {
    setMobileActiveIndex((prev) => Math.min(todayShifts.length - 1, prev + 1));
  }, [todayShifts.length]);

  const activeMobileShift = todayShifts[mobileActiveIndex] ?? todayShifts[0];

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    setTouchStartX(event.changedTouches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (touchStartX === null) return;

    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    const deltaX = endX - touchStartX;
    const swipeThreshold = 40;

    if (Math.abs(deltaX) >= swipeThreshold) {
      if (deltaX < 0) {
        goToNextTeam();
      } else {
        goToPreviousTeam();
      }
    }

    setTouchStartX(null);
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
            {hasTeams ? "All Teams" : "Schedule"}
          </span>
          <DayNavigationButtonGroup
            isCurrent={isToday}
            onPrevious={onPreviousDay}
            onCurrent={onTodayClick}
            onNext={onNextDay}
            selectorLabel={canSelectDate ? "Jump to date:" : undefined}
            selectorId={canSelectDate ? datePickerId : undefined}
            selectorValue={canSelectDate ? displayDate.format("YYYY-MM-DD") : undefined}
            onSelectorChange={canSelectDate ? handleDateChange : undefined}
          />
        </div>
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-2">
          <div className="d-flex align-items-center gap-2 flex-wrap">
            <div className="text-muted small">
              {displayDate.format("dddd, MMMM D, YYYY")}
              {isToday && (
                <Badge bg="success" className="ms-2" aria-label="Current day">
                  Today
                </Badge>
              )}
            </div>
          </div>
          <div className="small text-muted d-none d-lg-block">
            <i className="bi bi-keyboard me-1" aria-hidden="true"></i>
            Keyboard: ← → arrows, Ctrl+H (today)
          </div>
        </div>
      </Card.Header>
      <Card.Body>
        {isMobile && hasTeams && activeMobileShift ? (
          <div
            className="mobile-team-carousel"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                goToPreviousTeam();
              } else if (event.key === "ArrowRight") {
                event.preventDefault();
                goToNextTeam();
              }
            }}
            role="region"
            aria-label="Team schedule carousel"
            tabIndex={0}
          >
            <TeamCard
              shiftResult={activeMobileShift}
              isMyTeam={myTeam === activeMobileShift.teamNumber}
              isCurrentlyActive={isCurrentlyActive(activeMobileShift)}
              hasTeams={hasTeams}
              onTeamClick={onTeamClick}
              scheduleType={scheduleType}
            />
            <div className="mobile-team-carousel-controls">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={goToPreviousTeam}
                aria-label="Show previous team"
                disabled={mobileActiveIndex === 0}
              >
                <i className="bi bi-chevron-left" aria-hidden="true"></i>
              </button>
              <div className="mobile-team-carousel-dots" role="tablist" aria-label="Team position">
                {todayShifts.map((shiftResult, index) => (
                  <button
                    key={shiftResult.teamNumber}
                    type="button"
                    className={clsx("mobile-team-dot", index === mobileActiveIndex && "active")}
                    aria-label={`Show Team ${shiftResult.teamNumber}`}
                    aria-selected={index === mobileActiveIndex}
                    role="tab"
                    onClick={() => setMobileActiveIndex(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={goToNextTeam}
                aria-label="Show next team"
                disabled={mobileActiveIndex === todayShifts.length - 1}
              >
                <i className="bi bi-chevron-right" aria-hidden="true"></i>
              </button>
            </div>
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
                  scheduleType={scheduleType}
                />
              </Col>
            ))}
          </Row>
        )}
      </Card.Body>
    </Card>
  );
}
