import { useId, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import classNames from "classnames";
import { useSettings } from "../../contexts/SettingsContext";
import { getScheduleConfig, getEffectiveTeam } from "../../utils/scheduleUtils";
import { useCountdown } from "../../hooks/useCountdown";
import { useLiveTime } from "../../hooks/useLiveTime";
import { dayjs, formatTimeByPreference, formatYYWWD } from "../../utils/dateTimeUtils";
import type {
  UpcomingShiftResult,
  OffDayProgress,
  ShiftResult,
} from "../../utils/shiftCalculations";
import {
  calculateShift,
  getCurrentShiftDay,
  getNextShift,
  getOffDayProgress,
  getShiftByCode,
  getShiftDisplay,
  getShiftCode,
  getFormattedShiftTime,
  getCurrentWorkingTeam,
} from "../../utils/shiftCalculations";
import { ShiftTimeline } from "../ShiftTimeline";
import { ShiftTimeDisplay } from "../shared/ShiftTimeDisplay";
import { CountdownBadge } from "../shared/CountdownBadge";

interface PersonalizedStatusProps {
  myTeam: number; // User has selected a team (not null)
  onChangeTeam: () => void;
  onChangeSchedule?: () => void;
  onShowWhoIsWorking?: () => void;
}

/**
 * Personalized current status display for users who have selected their team.
 *
 * Shows the user's team status, next shift with countdown, off-day progress,
 * and a timeline for the currently working team.
 */
export function PersonalizedStatus({
  myTeam,
  onChangeTeam,
  onChangeSchedule,
  onShowWhoIsWorking,
}: PersonalizedStatusProps) {
  const dateTooltipId = useId();
  const teamTooltipId = useId();
  const { settings, scheduleType } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const hasTeams = scheduleConfig.showsTeamSelection;
  const teamCount = scheduleConfig.shiftConfig.teamCount;

  // Get effective team - for single-user schedules, this returns 1
  const validatedTeam = useMemo(
    () => getEffectiveTeam(myTeam, scheduleType),
    [myTeam, scheduleType],
  );

  const today = dayjs();
  const liveTime = useLiveTime();
  const todayMinuteKey = today.startOf("minute").toISOString();

  // Calculate current shift for today
  // This represents the shift scheduled for TODAY (calendar day), not the shift currently being worked
  // (e.g., at 2 AM on Monday, this shows Monday's shift, not Sunday night's shift)
  const currentShift = useMemo((): ShiftResult | null => {
    if (!validatedTeam) return null;

    // Use calendar day directly for schedule display
    const shift = calculateShift(today, validatedTeam, scheduleType);

    return {
      date: today,
      shift,
      code: getShiftCode(today, validatedTeam, scheduleType),
      teamNumber: validatedTeam,
    };
  }, [validatedTeam, todayMinuteKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps

  // Calculate next shift
  const nextShift = useMemo((): UpcomingShiftResult | null => {
    if (!validatedTeam) return null;
    return getNextShift(today, validatedTeam, scheduleType);
  }, [validatedTeam, todayMinuteKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps

  // Find which team is currently working
  const currentWorkingTeam = useMemo((): ShiftResult | null => {
    return getCurrentWorkingTeam(today, scheduleType);
  }, [todayMinuteKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps

  // Calculate off-day progress when team is off
  const offDayProgress = useMemo((): OffDayProgress | null => {
    if (!validatedTeam) return null;
    return getOffDayProgress(today, validatedTeam, scheduleType);
  }, [validatedTeam, todayMinuteKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps

  // Calculate next shift start time for countdown
  const nextShiftStartTime = useMemo(() => {
    if (!nextShift || !nextShift.shift.start) return null;
    const shiftDate = nextShift.date;
    const startTime = shiftDate.hour(nextShift.shift.start).minute(0).second(0);
    return startTime;
  }, [nextShift]);

  const countdown = useCountdown(nextShiftStartTime);

  const currentTimeShiftCode = useMemo(() => {
    if (!validatedTeam) return null;
    const shiftDay = getCurrentShiftDay(liveTime, scheduleType);
    const shift = calculateShift(shiftDay, validatedTeam, scheduleType);
    return shift.code;
  }, [liveTime, validatedTeam, scheduleType]);

  const currentShiftDay = useMemo(() => {
    return getCurrentShiftDay(liveTime, scheduleType);
  }, [liveTime, scheduleType]);

  // Tooltip details for current shift badge
  const shiftTooltipDetails = useMemo(() => {
    if (!currentShift) return null;
    const shift = getShiftByCode(currentShift.shift.code);
    const { displayName } = getShiftDisplay(shift, scheduleType);
    const formattedTime = getFormattedShiftTime(shift, scheduleType, settings.timeFormat);
    return `${shift.emoji} ${displayName} shift (${formattedTime})`;
  }, [currentShift, scheduleType, settings.timeFormat]);

  return (
    <Col className="mb-4">
      <Card>
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-3">
              <Card.Title className="mb-0">Current Status</Card.Title>
              <div className="text-muted">
                <OverlayTrigger
                  placement="bottom"
                  overlay={
                    <Tooltip id={dateTooltipId}>
                      <strong>Date Format: YYWW.D</strong>
                      <br />
                      YY = Year (2-digit)
                      <br />
                      WW = Week number
                      <br />D = Weekday (1=Mon, 7=Sun)
                      <br />
                      <em>
                        Today: {formatYYWWD(today)}
                        <br />
                        Shift Day: {formatYYWWD(currentShiftDay)}
                      </em>
                    </Tooltip>
                  }
                >
                  <small className="help-underline">
                    📅 {formatYYWWD(currentShiftDay)}
                    {currentTimeShiftCode} • {liveTime.format("dddd, MMM D")} •{" "}
                    {formatTimeByPreference(liveTime, settings.timeFormat)}
                  </small>
                </OverlayTrigger>
              </div>
            </div>
            <div className="d-flex gap-2">
              <Button
                variant="outline-primary"
                size="sm"
                onClick={onShowWhoIsWorking}
                title="See who's working right now"
                disabled={!onShowWhoIsWorking}
              >
                <i className="bi bi-people me-1"></i>
                Who's On?
              </Button>
              {hasTeams && teamCount > 1 ? (
                <Button variant="outline-secondary" size="sm" onClick={onChangeTeam}>
                  <i className="bi bi-person-gear me-1"></i>
                  Change Team
                </Button>
              ) : (
                onChangeSchedule && (
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    onClick={onChangeSchedule}
                    title="Change your work schedule"
                  >
                    <i className="bi bi-calendar-week me-1"></i>
                    Change Schedule
                  </Button>
                )
              )}
            </div>
          </div>

          {/* Timeline Row */}
          {currentWorkingTeam && (
            <Row className="mb-3">
              <Col>
                <ShiftTimeline currentWorkingTeam={currentWorkingTeam} today={today} />
              </Col>
            </Row>
          )}

          {/* Team Status Row */}
          <Row>
            <Col md={6}>
              <Card className="h-100">
                <Card.Body className="d-flex flex-column">
                  <Card.Title as="h6" className="mb-2 text-primary">
                    🏷️ Your Team Status
                  </Card.Title>
                  <div className="flex-grow-1">
                    {currentShift ? (
                      <div>
                        <OverlayTrigger
                          placement="bottom"
                          overlay={
                            <Tooltip id={teamTooltipId}>
                              <strong>Your Team Today</strong>
                              <br />
                              Code:{" "}
                              <strong>
                                {getShiftDisplay(currentShift.shift, scheduleType).displayCode}
                              </strong>
                              <br />
                              {shiftTooltipDetails}
                              <br />
                              <em>Full code: {currentShift.code}</em>
                            </Tooltip>
                          }
                        >
                          <Badge
                            className={classNames(
                              "shift-code",
                              "shift-badge-lg",
                              "cursor-help",
                              getShiftByCode(currentShift.shift.code).className,
                            )}
                          >
                            {hasTeams
                              ? `Team ${validatedTeam}: ${getShiftDisplay(currentShift.shift, scheduleType).displayName}`
                              : getShiftDisplay(currentShift.shift, scheduleType).displayName}
                          </Badge>
                        </OverlayTrigger>
                        {currentShift.shift.start && currentShift.shift.end && (
                          <ShiftTimeDisplay
                            shift={currentShift.shift}
                            scheduleType={scheduleType}
                            className="small text-muted mt-1"
                          />
                        )}
                        {!currentShift.shift.isWorking && offDayProgress && (
                          <div className="mt-2">
                            <div className="small text-muted mb-1">
                              Off Day Progress: Day {offDayProgress.current} of{" "}
                              {offDayProgress.total}
                            </div>
                            <ProgressBar
                              now={(offDayProgress.current / offDayProgress.total) * 100}
                              variant="info"
                              className="progress-thin"
                              aria-label={`Off day progress: ${offDayProgress.current} of ${offDayProgress.total} days`}
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card className="h-100">
                <Card.Body className="d-flex flex-column">
                  <Card.Title as="h6" className="mb-2 text-success">
                    <i className="bi bi-arrow-right-circle me-1"></i>
                    Your Next Shift
                  </Card.Title>
                  <div className="text-muted flex-grow-1">
                    {nextShift ? (
                      <div>
                        <div className="fw-semibold">
                          {nextShift.date.format("ddd, MMM D")} -{" "}
                          {getShiftDisplay(nextShift.shift, scheduleType).displayName}
                        </div>
                        <ShiftTimeDisplay
                          shift={nextShift.shift}
                          scheduleType={scheduleType}
                          className="small text-muted"
                        />
                        <CountdownBadge countdown={countdown} startTime={nextShiftStartTime} />
                      </div>
                    ) : (
                      <div>Next shift information not available</div>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </Col>
          </Row>
        </Card.Body>
      </Card>
    </Col>
  );
}
