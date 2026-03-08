import { useMemo } from "react";
import Badge from "react-bootstrap/Badge";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import type { ScheduleOption } from "../../data/rosters";
import { getScheduleConfig } from "../../utils/scheduleUtils";
import { useCountdown } from "../../hooks/useCountdown";
import { dayjs, setTimeFromFractionalHour } from "../../utils/dateTimeUtils";
import { getLocale } from "../../paraglide/runtime.js";
import type { UpcomingShiftResult, ShiftResult } from "../../utils/shiftCalculations";
import { getAllTeamsShifts, getCurrentWorkingTeam } from "../../utils/shiftCalculations";
import { ShiftTimeDisplay } from "../shared/ShiftTimeDisplay";
import { CountdownBadge } from "../shared/CountdownBadge";
import { ShiftBadge } from "../shared/ShiftBadge";
import { EmptyState } from "../shared/EmptyState";
import * as m from "../../paraglide/messages.js";

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

  const teamsSummary = useMemo(() => {
    if (!hasTeams) return null;

    const allTeamsToday = getAllTeamsShifts(today, scheduleType);
    const workingTeams = allTeamsToday.filter((team) => team.shift.isWorking).length;
    return {
      workingTeams,
      offTeams: allTeamsToday.length - workingTeams,
    };
  }, [hasTeams, scheduleType, todayMinuteKey]); // oxlint-disable-line react-hooks/exhaustive-deps -- dependencies intentionally use minute key for stable updates

  const currentShiftStartTime = useMemo(() => {
    if (!currentWorkingTeam || currentWorkingTeam.shift.start == null) return null;
    return setTimeFromFractionalHour(currentWorkingTeam.date, currentWorkingTeam.shift.start);
  }, [currentWorkingTeam]);

  const currentShiftEndTime = useMemo(() => {
    if (!currentWorkingTeam || currentWorkingTeam.shift.end == null) return null;

    const shiftStart = currentShiftStartTime;
    const shiftEnd = setTimeFromFractionalHour(
      currentWorkingTeam.date,
      currentWorkingTeam.shift.end,
    );

    if (!shiftStart) return shiftEnd;

    return shiftEnd.isBefore(shiftStart) ? shiftEnd.add(1, "day") : shiftEnd;
  }, [currentWorkingTeam, currentShiftStartTime]);

  const shiftEndCountdown = useCountdown(currentShiftEndTime);

  const shiftProgress = useMemo(() => {
    if (!currentShiftStartTime || !currentShiftEndTime) return null;

    const totalSeconds = currentShiftEndTime.diff(currentShiftStartTime, "second");
    if (totalSeconds <= 0) return null;

    const elapsedSeconds = today.diff(currentShiftStartTime, "second");
    const clampedElapsedSeconds = Math.max(0, elapsedSeconds);
    const remainingSeconds = Math.max(0, totalSeconds - clampedElapsedSeconds);

    return {
      percentage: Math.min(100, Math.max(0, (clampedElapsedSeconds / totalSeconds) * 100)),
      remainingHours: Math.floor(remainingSeconds / 3600),
      remainingMinutes: Math.floor((remainingSeconds % 3600) / 60),
    };
  }, [currentShiftStartTime, currentShiftEndTime, todayMinuteKey]); // oxlint-disable-line react-hooks/exhaustive-deps -- dependencies intentionally use minute key for stable updates

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
              {m.schedule_current_status()}
            </Card.Title>
            <div className="flex-grow-1">
              {currentWorkingTeam ? (
                <div>
                  {hasTeams && (
                    <span className="fw-semibold me-1">
                      {m.generic_status_team_label({ team: String(currentWorkingTeam.teamNumber) })}
                    </span>
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
                    {m.generic_status_currently_working()}
                  </div>
                  {shiftEndCountdown && !shiftEndCountdown.isExpired && (
                    <>
                      <CountdownBadge
                        countdown={shiftEndCountdown}
                        startTime={currentShiftEndTime}
                        label={m.generic_status_ends_in()}
                        variant="warning"
                      />
                      {shiftProgress && (
                        <div className="mt-2">
                          <div className="small text-muted mb-1">
                            {m.generic_status_shift_progress_remaining({
                              hours: String(shiftProgress.remainingHours),
                              minutes: String(shiftProgress.remainingMinutes),
                            })}
                          </div>
                          <ProgressBar
                            now={shiftProgress.percentage}
                            variant="warning"
                            className="progress-thin"
                            aria-label={m.generic_status_shift_progress_remaining_aria({
                              hours: String(shiftProgress.remainingHours),
                              minutes: String(shiftProgress.remainingMinutes),
                            })}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="bi-moon-stars"
                  title={m.generic_status_no_teams_title()}
                  description={m.generic_status_no_teams_desc()}
                />
              )}
              {teamsSummary && (
                <div className="mt-3">
                  <Badge bg="info" text="dark">
                    {m.generic_status_working_off({
                      working: String(teamsSummary.workingTeams),
                      off: String(teamsSummary.offTeams),
                    })}
                  </Badge>
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
              {m.generic_status_next_activity()}
            </Card.Title>
            <div className="text-muted flex-grow-1">
              {nextShiftAnyTeam ? (
                <div>
                  <div className="fw-semibold">
                    {hasTeams ? m.generic_status_team_label({ team: String(nextShiftAnyTeam.teamNumber) }) : ""}
                    {new Intl.DateTimeFormat(getLocale(), { weekday: "short", month: "short", day: "numeric" }).format(nextShiftAnyTeam.date.toDate())} - {nextShiftAnyTeam.shift.name}
                  </div>
                  <ShiftTimeDisplay shift={nextShiftAnyTeam.shift} className="small text-muted" />
                  <CountdownBadge countdown={countdown} startTime={nextShiftStartTime} />
                </div>
              ) : (
                <EmptyState
                  icon="bi-calendar-x"
                  title={m.generic_status_no_upcoming_title()}
                  description={m.generic_status_no_upcoming_desc()}
                />
              )}
            </div>
          </Card.Body>
        </Card>
      </Col>
      {hasTeams && (
        <Col xs={12} className="mt-3">
          <div className="small text-muted text-center">
            <i className="bi bi-lightbulb me-1" aria-hidden="true"></i>
            {m.generic_status_select_team_hint()}
          </div>
        </Col>
      )}
    </Row>
  );
}
