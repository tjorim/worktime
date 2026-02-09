import { useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import type { ScheduleOption } from "../../data/rosters";
import { getScheduleConfig } from "../../utils/scheduleUtils";
import { useCountdown } from "../../hooks/useCountdown";
import { dayjs, setTimeFromFractionalHour } from "../../utils/dateTimeUtils";
import type { UpcomingShiftResult, ShiftResult } from "../../utils/shiftCalculations";
import { getAllTeamsShifts, getCurrentWorkingTeam } from "../../utils/shiftCalculations";
import { ShiftTimeDisplay } from "../shared/ShiftTimeDisplay";
import { CountdownBadge } from "../shared/CountdownBadge";
import { ShiftBadge } from "../shared/ShiftBadge";
import { EmptyState } from "../shared/EmptyState";

interface GenericStatusContentProps {
  scheduleType: ScheduleOption;
}

/**
 * Generic status content showing an overview for all teams.
 *
 * Displays "Current Status" (which team is working now) and
 * "Next Activity" (next shift for any team with countdown).
 *
 * This is a content component rendered by CurrentStatus - it does not include
 * the Card wrapper, header row, or timeline.
 */
export function GenericStatusContent({ scheduleType }: GenericStatusContentProps) {
  const scheduleConfig = getScheduleConfig(scheduleType);
  const hasTeams = scheduleConfig.shiftConfig.teamCount > 1;
  const teamCount = scheduleConfig.shiftConfig.teamCount;

  const today = dayjs();
  const todayMinuteKey = today.startOf("minute").toISOString();

  // Find which team is currently working
  const currentWorkingTeam = useMemo((): ShiftResult | null => {
    return getCurrentWorkingTeam(today, scheduleType);
  }, [todayMinuteKey, scheduleType]); // oxlint-disable-line react-hooks/exhaustive-deps -- dependencies intentionally use minute key for stable updates

  // Calculate next shift change across all teams
  const nextShiftAnyTeam = useMemo((): (UpcomingShiftResult & { teamNumber: number }) | null => {
    const now = today;
    let earliestShift: (UpcomingShiftResult & { teamNumber: number }) | null = null;
    let earliestStartTime: ReturnType<typeof dayjs> | null = null;

    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const checkDate = now.add(dayOffset, "day");
      const allTeamsShifts = getAllTeamsShifts(checkDate, scheduleType);

      for (const teamShift of allTeamsShifts) {
        if (!teamShift.shift.isWorking || teamShift.shift.start == null) continue;

        const shiftStartTime = setTimeFromFractionalHour(teamShift.date, teamShift.shift.start);

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
  }, [todayMinuteKey, scheduleType]); // oxlint-disable-line react-hooks/exhaustive-deps -- dependencies intentionally use minute key for stable updates

  // Calculate next shift start time for countdown
  const nextShiftStartTime = useMemo(() => {
    if (!nextShiftAnyTeam || nextShiftAnyTeam.shift.start == null) return null;
    return setTimeFromFractionalHour(nextShiftAnyTeam.date, nextShiftAnyTeam.shift.start);
  }, [nextShiftAnyTeam]);

  const countdown = useCountdown(nextShiftStartTime);

  return (
    <Row>
      <Col md={6}>
        <Card className="h-100">
          <Card.Body className="d-flex flex-column">
            <Card.Title as="h6" className="mb-2 text-primary">
              <i
                className={`bi ${hasTeams ? "bi-people" : "bi-calendar2"} me-1`}
                aria-hidden="true"
              ></i>
              Current Status
            </Card.Title>
            <div className="flex-grow-1">
              {currentWorkingTeam ? (
                <div>
                  {hasTeams && (
                    <span className="fw-semibold me-1">Team {currentWorkingTeam.teamNumber}:</span>
                  )}
                  <ShiftBadge
                    shift={currentWorkingTeam.shift}
                    showName
                    size="lg"
                    showTooltip={false}
                  />
                  <ShiftTimeDisplay
                    shift={currentWorkingTeam.shift}
                    className="small text-muted mt-1"
                  />
                  <div className="small text-success mt-2">
                    <i className="bi bi-check-circle me-1" aria-hidden="true"></i>
                    Currently working
                  </div>
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
                  <i className="bi bi-lightbulb me-1" aria-hidden="true"></i>
                  Select your team above for personalized shift tracking and countdown timers
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
              <i className="bi bi-arrow-right-circle me-1" aria-hidden="true"></i>
              Next Activity
            </Card.Title>
            <div className="text-muted flex-grow-1">
              {nextShiftAnyTeam ? (
                <div>
                  <div className="fw-semibold">
                    {hasTeams ? `Team ${nextShiftAnyTeam.teamNumber}: ` : ""}
                    {nextShiftAnyTeam.date.format("ddd, MMM D")} - {nextShiftAnyTeam.shift.name}
                  </div>
                  <ShiftTimeDisplay shift={nextShiftAnyTeam.shift} className="small text-muted" />
                  <CountdownBadge countdown={countdown} startTime={nextShiftStartTime} />
                  <hr className="my-3" />
                  {hasTeams && teamCount > 1 && (
                    <div className="small text-muted">
                      <i className="bi bi-lightbulb me-1" aria-hidden="true"></i>
                      Select your team above for personalized shift tracking
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="bi-calendar-x"
                  title="No Upcoming Shifts"
                  description="View the schedule in other tabs for detailed timing"
                />
              )}
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
