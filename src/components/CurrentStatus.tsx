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
import { useCountdown } from "../hooks/useCountdown";
import { useLiveTime } from "../hooks/useLiveTime";
import { CONFIG } from "../utils/config";
import {
  dayjs,
  formatTimeByPreference,
  formatYYWWD,
  getLocalizedShiftTime,
} from "../utils/dateTimeUtils";
import type { UpcomingShiftResult, OffDayProgress, ShiftResult } from "../utils/shiftCalculations";
import {
  calculateShift,
  getAllTeamsShifts,
  getCurrentShiftDay,
  getNextShift,
  getOffDayProgress,
  getShiftByCode,
  getShiftCode,
  isCurrentlyWorking,
} from "../utils/shiftCalculations";
import { ShiftTimeline } from "./ShiftTimeline";

interface CurrentStatusProps {
  myTeam: number | null; // The user's team from onboarding
  onChangeTeam: () => void;
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
 * @param onShowWhoIsWorking - Optional callback to show who is currently working; the corresponding control is disabled if omitted.
 * @returns A React element containing the Current Status card with status, timeline and next-shift information.
 */
export function CurrentStatus({ myTeam, onChangeTeam, onShowWhoIsWorking }: CurrentStatusProps) {
  // Generate unique IDs for tooltips to avoid HTML ID conflicts
  const dateTooltipId = useId();
  const teamTooltipId = useId();

  // Validate and sanitize myTeam prop
  const validatedTeam =
    typeof myTeam === "number" && myTeam >= 1 && myTeam <= CONFIG.TEAMS_COUNT ? myTeam : null;

  if (myTeam !== null && validatedTeam === null) {
    console.warn(`Invalid team number: ${myTeam}. Expected 1-${CONFIG.TEAMS_COUNT}`);
  }
  // Always use today's date for current status
  const today = dayjs();
  const liveTime = useLiveTime();
  const todayMinuteKey = today.startOf("minute").toISOString();

  // Calculate current shift for today
  const currentShift = useMemo((): ShiftResult | null => {
    if (!validatedTeam) return null;

    const shiftDay = getCurrentShiftDay(today);
    const shift = calculateShift(shiftDay, validatedTeam);

    return {
      date: shiftDay,
      shift,
      code: getShiftCode(shiftDay, validatedTeam),
      teamNumber: validatedTeam,
    };
  }, [validatedTeam, todayMinuteKey]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Calculate next shift from today
  const nextShift = useMemo((): UpcomingShiftResult | null => {
    if (!validatedTeam) return null;
    return getNextShift(today, validatedTeam);
  }, [validatedTeam, todayMinuteKey]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Calculate next shift change across all teams when no team is selected
  const nextShiftAnyTeam = useMemo((): (UpcomingShiftResult & { teamNumber: number }) | null => {
    if (validatedTeam) return null;

    const now = today;
    let earliestShift: (UpcomingShiftResult & { teamNumber: number }) | null = null;
    let earliestStartTime: ReturnType<typeof dayjs> | null = null;

    // Check shifts for today and next few days to find the next shift change
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = now.add(dayOffset, "day");
      const allTeamsShifts = getAllTeamsShifts(checkDate);

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
  }, [validatedTeam, todayMinuteKey]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Find which team is currently working
  const currentWorkingTeam = useMemo((): ShiftResult | null => {
    const now = today;

    // Check today's shifts
    const allTeamsToday = getAllTeamsShifts(today);
    const workingToday = allTeamsToday.find((teamShift) => {
      if (!teamShift.shift.isWorking) return false;
      return isCurrentlyWorking(teamShift.shift, teamShift.date, now);
    });

    if (workingToday) return workingToday;

    // Also check yesterday's shifts (for night shifts spanning midnight)
    const yesterday = today.subtract(1, "day");
    const allTeamsYesterday = getAllTeamsShifts(yesterday);
    const workingYesterday = allTeamsYesterday.find((teamShift) => {
      if (!teamShift.shift.isWorking) return false;
      return isCurrentlyWorking(teamShift.shift, teamShift.date, now);
    });

    return workingYesterday || null;
  }, [todayMinuteKey]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

  // Calculate off-day progress when team is off
  const offDayProgress = useMemo((): OffDayProgress | null => {
    if (!validatedTeam) return null;
    return getOffDayProgress(today, validatedTeam);
  }, [validatedTeam, todayMinuteKey]); // oxlint-disable-line react/exhaustive-deps -- Using minute-based ISO string to limit recalculation to once per minute instead of every render

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

  // Get current time's shift code for live display
  const currentTimeShiftCode = useMemo(() => {
    const hour = liveTime.hour();
    if (hour >= 7 && hour < 15) return "M";
    if (hour >= 15 && hour < 23) return "E";
    return "N"; // 23:00-07:00
  }, [liveTime]);

  // Get the proper shift day for date code display (previous day for night shifts)
  const currentShiftDay = useMemo(() => {
    return getCurrentShiftDay(liveTime);
  }, [liveTime]);

  const { settings } = useSettings();

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
                  delay={0}
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
              <Button
                variant={validatedTeam ? "outline-secondary" : "primary"}
                size="sm"
                onClick={onChangeTeam}
              >
                <i className={`bi ${validatedTeam ? "bi-person-gear" : "bi-person-plus"} me-1`}></i>
                {validatedTeam ? "Change Team" : "Select Team"}
              </Button>
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
                    {validatedTeam ? "🏷️ Your Team Status" : "👥 Current Status"}
                  </Card.Title>
                  <div className="flex-grow-1">
                    {validatedTeam && currentShift ? (
                      <div>
                        <OverlayTrigger
                          placement="bottom"
                          delay={0}
                          overlay={
                            <Tooltip id={teamTooltipId}>
                              <strong>Your Team Today</strong>
                              <br />
                              Code: <strong>{currentShift.shift.code}</strong>
                              <br />
                              {(() => {
                                const shift = getShiftByCode(currentShift.shift.code);
                                return `${shift.emoji} ${shift.name} shift (${shift.start && shift.end ? getLocalizedShiftTime(shift.start, shift.end, settings.timeFormat) : shift.hours})`;
                              })()}
                              <br />
                              <em>Full code: {currentShift.code}</em>
                            </Tooltip>
                          }
                        >
                          <Badge
                            className={`shift-code shift-badge-lg cursor-help ${getShiftByCode(currentShift.shift.code).className}`}
                          >
                            Team {validatedTeam}: {currentShift.shift.name}
                          </Badge>
                        </OverlayTrigger>
                        {currentShift.shift.start && currentShift.shift.end && (
                          <div className="small text-muted mt-1">
                            {getLocalizedShiftTime(
                              currentShift.shift.start,
                              currentShift.shift.end,
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
                              Team {currentWorkingTeam.teamNumber}: {currentWorkingTeam.shift.name}
                            </Badge>
                            <div className="small text-muted mt-1">
                              {currentWorkingTeam.shift.start && currentWorkingTeam.shift.end
                                ? getLocalizedShiftTime(
                                    currentWorkingTeam.shift.start,
                                    currentWorkingTeam.shift.end,
                                    settings.timeFormat,
                                  )
                                : currentWorkingTeam.shift.hours}
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
                        <div className="small text-muted">
                          💡 Select your team above for personalized shift tracking and countdown
                          timers
                        </div>
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
                          {nextShift.date.format("ddd, MMM D")} - {nextShift.shift.name}
                        </div>
                        <div className="small text-muted">
                          {nextShift.shift.start && nextShift.shift.end
                            ? getLocalizedShiftTime(
                                nextShift.shift.start,
                                nextShift.shift.end,
                                settings.timeFormat,
                              )
                            : nextShift.shift.hours}
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
                          Team {nextShiftAnyTeam.teamNumber}:{" "}
                          {nextShiftAnyTeam.date.format("ddd, MMM D")} -{" "}
                          {nextShiftAnyTeam.shift.name}
                        </div>
                        <div className="small text-muted">
                          {nextShiftAnyTeam.shift.start && nextShiftAnyTeam.shift.end
                            ? getLocalizedShiftTime(
                                nextShiftAnyTeam.shift.start,
                                nextShiftAnyTeam.shift.end,
                                settings.timeFormat,
                              )
                            : nextShiftAnyTeam.shift.hours}
                        </div>
                        {countdown && !countdown.isExpired && nextShiftStartTime && (
                          <Badge bg="info" className="mt-2">
                            ⏰ Starts in {countdown.formatted}
                          </Badge>
                        )}
                        <hr className="my-3" />
                        <div className="small text-muted">
                          💡 Select your team above for personalized shift tracking
                        </div>
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
