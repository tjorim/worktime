import { useId, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import { useSettings } from "../contexts/SettingsContext";
import { getScheduleConfig, getEffectiveTeam } from "../utils/scheduleUtils";
import { useCountdown } from "../hooks/useCountdown";
import { useLiveTime } from "../hooks/useLiveTime";
import { dayjs, formatTimeByPreference, formatYYWWD } from "../utils/dateTimeUtils";
import type { UpcomingShiftResult, OffDayProgress, ShiftResult } from "../utils/shiftCalculations";
import {
  calculateShift,
  getAllTeamsShifts,
  getCurrentShiftDay,
  getNextShift,
  getOffDayProgress,
  getShiftByCode,
  getShiftDisplay,
  getShiftCode,
  getFormattedShiftTime,
  isCurrentlyWorking,
} from "../utils/shiftCalculations";
import { ShiftTimeline } from "./ShiftTimeline";

interface CurrentStatusProps {
  myTeam: number | null; // The user's team from onboarding
  onChangeTeam: () => void;
  onChangeSchedule?: () => void;
  onShowWhoIsWorking?: () => void;
}

/**
 * Render current and upcoming shift information, personalized when a team is selected.
 *
 * Shows current shift status, next shift details with countdown, off-day progress, an optional timeline
 * for the currently working team, and controls to select/change the team or view who is working.
 *
 * @param myTeam - The user's team number from onboarding, or `null` to show a generic view.
 * @param onChangeTeam - Callback invoked when the user requests to select or change their team.
 * @param onChangeSchedule - Optional callback invoked when the user requests to change their schedule.
 * @param onShowWhoIsWorking - Optional callback to show who is currently working; the corresponding control is disabled if omitted.
 * @returns A React element containing the Current Status card with status, timeline and next-shift information.
 */
export function CurrentStatus({
  myTeam,
  onChangeTeam,
  onChangeSchedule,
  onShowWhoIsWorking,
}: CurrentStatusProps) {
  // Generate unique IDs for tooltips to avoid HTML ID conflicts
  const dateTooltipId = useId();
  const teamTooltipId = useId();
  const { settings, scheduleOption } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleOption);
  const hasTeams = scheduleConfig.showsTeamSelection ?? true;
  const rawTeamCount = scheduleConfig.shiftConfig.teamCount;
  if (rawTeamCount == null) {
    throw new Error("scheduleConfig.shiftConfig.teamCount is null or undefined; schedule configuration is invalid.");
  }
  const teamCount = rawTeamCount;

  // Get effective team - for single-user schedules, this returns 1 when myTeam is null
  const validatedTeam = getEffectiveTeam(myTeam, scheduleOption);

  // Always use today's date for current status
  const today = dayjs();
  const liveTime = useLiveTime();
  const todayMinuteKey = today.startOf("minute").toISOString();

  // Calculate current shift for today
  const currentShift = useMemo((): ShiftResult | null => {
    if (!validatedTeam) return null;

    const shiftDay = getCurrentShiftDay(today);
    const shift = calculateShift(shiftDay, validatedTeam, scheduleOption ?? undefined);

    return {
      date: shiftDay,
      shift,
      code: getShiftCode(today, validatedTeam, scheduleOption ?? undefined),
      teamNumber: validatedTeam,
    };
  }, [validatedTeam, todayMinuteKey, scheduleOption]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Calculate next shift from today
  const nextShift = useMemo((): UpcomingShiftResult | null => {
    if (!validatedTeam) return null;
    return getNextShift(today, validatedTeam, scheduleOption ?? undefined);
  }, [validatedTeam, todayMinuteKey, scheduleOption]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Calculate next shift change across all teams when no team is selected
  const nextShiftAnyTeam = useMemo((): (UpcomingShiftResult & { teamNumber: number }) | null => {
    if (validatedTeam) return null;

    const now = today;
    let earliestShift: (UpcomingShiftResult & { teamNumber: number }) | null = null;
    let earliestStartTime: ReturnType<typeof dayjs> | null = null;

    // Check shifts for today and next few days to find the next shift change
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = now.add(dayOffset, "day");
      const allTeamsShifts = getAllTeamsShifts(checkDate, scheduleOption ?? undefined);

      for (const teamShift of allTeamsShifts) {
        if (!teamShift.shift.isWorking || !teamShift.shift.start) continue;

        const shiftStartTime = teamShift.date.hour(teamShift.shift.start).minute(0).second(0);

        // Only consider shifts that start in the future
        if (!shiftStartTime.isAfter(now)) continue;

        if (!earliestShift || !earliestStartTime || shiftStartTime.isBefore(earliestStartTime)) {
          earliestShift = {
            date: teamShift.date,
            shift: teamShift.shift,
            code: teamShift.code,
            teamNumber: teamShift.teamNumber,
          };
          earliestStartTime = shiftStartTime;
        }
      }

      // If we found a shift, no need to check further days
      if (earliestShift) break;
    }

    return earliestShift;
  }, [validatedTeam, todayMinuteKey, scheduleOption]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Find which team is currently working
  const currentWorkingTeam = useMemo((): ShiftResult | null => {
    const now = today;

    // Check today's shifts
    const allTeamsToday = getAllTeamsShifts(today, scheduleOption ?? undefined);
    const workingToday = allTeamsToday.find((teamShift) => {
      if (!teamShift.shift.isWorking) return false;
      return isCurrentlyWorking(teamShift.shift, teamShift.date, now);
    });

    if (workingToday) return workingToday;

    // Also check yesterday's shifts (for night shifts spanning midnight)
    const yesterday = today.subtract(1, "day");
    const allTeamsYesterday = getAllTeamsShifts(yesterday, scheduleOption ?? undefined);
    const workingYesterday = allTeamsYesterday.find((teamShift) => {
      if (!teamShift.shift.isWorking) return false;
      return isCurrentlyWorking(teamShift.shift, teamShift.date, now);
    });

    return workingYesterday || null;
  }, [todayMinuteKey, scheduleOption]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Calculate off-day progress when team is off
  const offDayProgress = useMemo((): OffDayProgress | null => {
    if (!validatedTeam) return null;
    return getOffDayProgress(today, validatedTeam, scheduleOption ?? undefined);
  }, [validatedTeam, todayMinuteKey, scheduleOption]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Calculate next shift start time for countdown
  const nextShiftStartTime = useMemo(() => {
    const shift = validatedTeam ? nextShift : nextShiftAnyTeam;
    if (!shift || !shift.shift.start) return null;

    // Create datetime for the shift start
    const shiftDate = shift.date;
    const startTime = shiftDate.hour(shift.shift.start).minute(0).second(0);

    return startTime;
  }, [nextShift, nextShiftAnyTeam, validatedTeam]);

  // Countdown to next shift
  const countdown = useCountdown(nextShiftStartTime);

  // Get current time's shift code for live display (roster-aware)
  const currentTimeShiftCode = useMemo(() => {
    if (!validatedTeam) return null;
    const shiftDay = getCurrentShiftDay(liveTime);
    const shift = calculateShift(shiftDay, validatedTeam, scheduleOption ?? undefined);
    return shift.code;
  }, [liveTime, validatedTeam, scheduleOption]);

  // Get the proper shift day for date code display (previous day for night shifts)
  const currentShiftDay = useMemo(() => {
    return getCurrentShiftDay(liveTime);
  }, [liveTime]);

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
              {/* Show team selection button for multi-team schedules, or schedule change button for single-team schedules */}
              {hasTeams && teamCount > 1 ? (
                <Button
                  variant={validatedTeam ? "outline-secondary" : "primary"}
                  size="sm"
                  onClick={onChangeTeam}
                >
                  <i
                    className={`bi ${validatedTeam ? "bi-person-gear" : "bi-person-plus"} me-1`}
                  ></i>
                  {validatedTeam ? "Change Team" : "Select Team"}
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
                    {validatedTeam
                      ? "🏷️ Your Team Status"
                      : hasTeams
                        ? "👥 Current Status"
                        : "📅 Current Status"}
                  </Card.Title>
                  <div className="flex-grow-1">
                    {validatedTeam && currentShift ? (
                      <div>
                        <OverlayTrigger
                          placement="bottom"
                          overlay={
                            <Tooltip id={teamTooltipId}>
                              <strong>Your Team Today</strong>
                              <br />
                              Code:{" "}
                              <strong>
                                {getShiftDisplay(currentShift.shift, scheduleOption).displayCode}
                              </strong>
                              <br />
                              {(() => {
                                const shift = getShiftByCode(currentShift.shift.code);
                                const { displayName } = getShiftDisplay(shift, scheduleOption);
                                const formattedTime = getFormattedShiftTime(
                                  shift,
                                  scheduleOption,
                                  settings.timeFormat,
                                );
                                return `${shift.emoji} ${displayName} shift (${formattedTime})`;
                              })()}
                              <br />
                              <em>Full code: {currentShift.code}</em>
                            </Tooltip>
                          }
                        >
                          <Badge
                            className={`shift-code shift-badge-lg cursor-help ${getShiftByCode(currentShift.shift.code).className}`}
                          >
                            {hasTeams
                              ? `Team ${validatedTeam}: ${getShiftDisplay(currentShift.shift, scheduleOption).displayName}`
                              : getShiftDisplay(currentShift.shift, scheduleOption).displayName}
                          </Badge>
                        </OverlayTrigger>
                        {currentShift.shift.start && currentShift.shift.end && (
                          <div className="small text-muted mt-1">
                            {getFormattedShiftTime(
                              currentShift.shift,
                              scheduleOption,
                              settings.timeFormat,
                            )}
                          </div>
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
                    ) : !validatedTeam ? (
                      <div>
                        {currentWorkingTeam ? (
                          <div>
                            <Badge
                              className={`shift-code shift-badge-lg ${getShiftByCode(currentWorkingTeam.shift.code).className}`}
                            >
                              {hasTeams
                                ? `Team ${currentWorkingTeam.teamNumber}: ${getShiftDisplay(currentWorkingTeam.shift, scheduleOption).displayName}`
                                : getShiftDisplay(currentWorkingTeam.shift, scheduleOption)
                                    .displayName}
                            </Badge>
                            <div className="small text-muted mt-1">
                              {getFormattedShiftTime(
                                currentWorkingTeam.shift,
                                scheduleOption,
                                settings.timeFormat,
                              )}
                            </div>
                            <div className="small text-success mt-2">✅ Currently working</div>
                          </div>
                        ) : (
                          <div className="text-muted">
                            <div className="mb-2">
                              <Badge bg="secondary">No teams working</Badge>
                            </div>
                            <div className="small">All teams are currently off duty</div>
                          </div>
                        )}
                        <hr className="my-3" />
                        {hasTeams && teamCount > 1 && (
                          <div className="small text-muted">
                            💡 Select your team above for personalized shift tracking and countdown
                            timers
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
                    {validatedTeam ? "Your Next Shift" : "Next Activity"}
                  </Card.Title>
                  <div className="text-muted flex-grow-1">
                    {validatedTeam && nextShift ? (
                      <div>
                        <div className="fw-semibold">
                          {nextShift.date.format("ddd, MMM D")} -{" "}
                          {getShiftDisplay(nextShift.shift, scheduleOption).displayName}
                        </div>
                        <div className="small text-muted">
                          {getFormattedShiftTime(
                            nextShift.shift,
                            scheduleOption,
                            settings.timeFormat,
                          )}
                        </div>
                        {countdown && !countdown.isExpired && nextShiftStartTime && (
                          <Badge bg="info" className="mt-2">
                            ⏰ Starts in {countdown.formatted}
                          </Badge>
                        )}
                      </div>
                    ) : validatedTeam ? (
                      <div>Next shift information not available</div>
                    ) : nextShiftAnyTeam ? (
                      <div>
                        <div className="fw-semibold">
                          {hasTeams ? `Team ${nextShiftAnyTeam.teamNumber}: ` : ""}
                          {nextShiftAnyTeam.date.format("ddd, MMM D")} -{" "}
                          {getShiftDisplay(nextShiftAnyTeam.shift, scheduleOption).displayName}
                        </div>
                        <div className="small text-muted">
                          {getFormattedShiftTime(
                            nextShiftAnyTeam.shift,
                            scheduleOption,
                            settings.timeFormat,
                          )}
                        </div>
                        {countdown && !countdown.isExpired && nextShiftStartTime && (
                          <Badge bg="info" className="mt-2">
                            ⏰ Starts in {countdown.formatted}
                          </Badge>
                        )}
                        <hr className="my-3" />
                        {hasTeams && teamCount > 1 && (
                          <div className="small text-muted">
                            💡 Select your team above for personalized shift tracking
                          </div>
                        )}
                      </div>
                    ) : (
                      <div>
                        <div className="fw-semibold">No upcoming shifts found</div>
                        <div className="small text-muted">
                          View the schedule in other tabs for detailed timing
                        </div>
                      </div>
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
