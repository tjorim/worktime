import { useId, useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import classNames from "classnames";
import { useSettings } from "../../contexts/SettingsContext";
import { SetupActionButton } from "../shared/SetupActionButton";
import { useSetupAction } from "../../hooks/useSetupAction";
import { useCountdown } from "../../hooks/useCountdown";
import { useLiveTime } from "../../hooks/useLiveTime";
import { dayjs, formatTimeByPreference, formatYYWWD } from "../../utils/dateTimeUtils";
import type { UpcomingShiftResult, ShiftResult } from "../../utils/shiftCalculations";
import {
  getAllTeamsShifts,
  getCurrentShiftDay,
  getShiftByCode,
  getShiftDisplay,
  getCurrentWorkingTeam,
} from "../../utils/shiftCalculations";
import { ShiftTimeline } from "../ShiftTimeline";
import { ShiftTimeDisplay } from "../shared/ShiftTimeDisplay";
import { CountdownBadge } from "../shared/CountdownBadge";

interface GenericStatusProps {
  onChangeTeam: () => void;
  onChangeSchedule?: () => void;
  onShowWhoIsWorking?: () => void;
}

/**
 * Generic current status display for users who haven't selected a team.
 *
 * Shows which team is currently working and prompts the user to select
 * their team for personalized tracking.
 */
export function GenericStatus({
  onChangeTeam,
  onChangeSchedule,
  onShowWhoIsWorking,
}: GenericStatusProps) {
  const dateTooltipId = useId();
  const { settings, scheduleType } = useSettings();
  const { hasTeams, teamCount } = useSetupAction();

  const today = dayjs();
  const liveTime = useLiveTime();
  const todayMinuteKey = today.startOf("minute").toISOString();

  // Find which team is currently working
  const currentWorkingTeam = useMemo((): ShiftResult | null => {
    return getCurrentWorkingTeam(today, scheduleType);
  }, [todayMinuteKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps

  // Calculate next shift change across all teams
  const nextShiftAnyTeam = useMemo((): (UpcomingShiftResult & { teamNumber: number }) | null => {
    const now = today;
    let earliestShift: (UpcomingShiftResult & { teamNumber: number }) | null = null;
    let earliestStartTime: ReturnType<typeof dayjs> | null = null;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = now.add(dayOffset, "day");
      const allTeamsShifts = getAllTeamsShifts(checkDate, scheduleType);

      for (const teamShift of allTeamsShifts) {
        if (!teamShift.shift.isWorking || !teamShift.shift.start) continue;

        const shiftStartTime = teamShift.date.hour(teamShift.shift.start).minute(0).second(0);

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

      if (earliestShift) break;
    }

    return earliestShift;
  }, [todayMinuteKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps

  // Calculate next shift start time for countdown
  const nextShiftStartTime = useMemo(() => {
    if (!nextShiftAnyTeam || !nextShiftAnyTeam.shift.start) return null;
    const shiftDate = nextShiftAnyTeam.date;
    const startTime = shiftDate.hour(nextShiftAnyTeam.shift.start).minute(0).second(0);
    return startTime;
  }, [nextShiftAnyTeam]);

  const countdown = useCountdown(nextShiftStartTime);

  const currentShiftDay = useMemo(() => {
    return getCurrentShiftDay(liveTime, scheduleType);
  }, [liveTime, scheduleType]);

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
                    📅 {formatYYWWD(currentShiftDay)} • {liveTime.format("dddd, MMM D")} •{" "}
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
              <SetupActionButton
                onChangeSchedule={onChangeSchedule}
                onChangeTeam={onChangeTeam}
                size="sm"
                showChangeSchedule
              />
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

          {/* Status Row */}
          <Row>
            <Col md={6}>
              <Card className="h-100">
                <Card.Body className="d-flex flex-column">
                  <Card.Title as="h6" className="mb-2 text-primary">
                    {hasTeams ? "👥 Current Status" : "📅 Current Status"}
                  </Card.Title>
                  <div className="flex-grow-1">
                    {currentWorkingTeam ? (
                      <div>
                        <Badge
                          className={classNames(
                            "shift-code",
                            "shift-badge-lg",
                            getShiftByCode(currentWorkingTeam.shift.code).className,
                          )}
                        >
                          {hasTeams
                            ? `Team ${currentWorkingTeam.teamNumber}: ${getShiftDisplay(currentWorkingTeam.shift, scheduleType).displayName}`
                            : getShiftDisplay(currentWorkingTeam.shift, scheduleType).displayName}
                        </Badge>
                        <ShiftTimeDisplay
                          shift={currentWorkingTeam.shift}
                          scheduleType={scheduleType}
                          className="small text-muted mt-1"
                        />
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
                </Card.Body>
              </Card>
            </Col>
            <Col md={6}>
              <Card className="h-100">
                <Card.Body className="d-flex flex-column">
                  <Card.Title as="h6" className="mb-2 text-success">
                    <i className="bi bi-arrow-right-circle me-1"></i>
                    Next Activity
                  </Card.Title>
                  <div className="text-muted flex-grow-1">
                    {nextShiftAnyTeam ? (
                      <div>
                        <div className="fw-semibold">
                          {hasTeams ? `Team ${nextShiftAnyTeam.teamNumber}: ` : ""}
                          {nextShiftAnyTeam.date.format("ddd, MMM D")} -{" "}
                          {getShiftDisplay(nextShiftAnyTeam.shift, scheduleType).displayName}
                        </div>
                        <ShiftTimeDisplay
                          shift={nextShiftAnyTeam.shift}
                          scheduleType={scheduleType}
                          className="small text-muted"
                        />
                        <CountdownBadge countdown={countdown} startTime={nextShiftStartTime} />
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
