import { useId, useMemo } from "react";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import type { ScheduleOption } from "../../data/rosters";
import { getScheduleConfig, isValidScheduleType } from "../../utils/scheduleUtils";
import { useCountdown } from "../../hooks/useCountdown";
import { useFormattedShiftTime } from "../../hooks/useFormattedShiftTime";
import { useLiveShiftStatus } from "../../hooks/useLiveShiftStatus";
import { setTimeFromFractionalHour } from "../../utils/dateTimeUtils";
import { getLocale } from "../../paraglide/runtime.js";
import { ShiftTimeDisplay } from "../shared/ShiftTimeDisplay";
import { CountdownBadge } from "../shared/CountdownBadge";
import { ShiftBadge } from "../shared/ShiftBadge";
import { EmptyState } from "../shared/EmptyState";
import * as m from "../../paraglide/messages.js";

interface PersonalizedStatusContentProps {
  myTeam: number;
  scheduleType: ScheduleOption;
}

/**
 * Personalized status content showing the user's team shifts.
 *
 * Displays "Your Team Status" (today's shift with off-day progress) and
 * "Your Next Shift" (upcoming shift with countdown).
 *
 * This is a content component rendered by CurrentStatus - it does not include
 * the Card wrapper, header row, or timeline.
 */
export function PersonalizedStatusContent({
  myTeam,
  scheduleType,
}: PersonalizedStatusContentProps) {
  if (!isValidScheduleType(scheduleType)) {
    return (
      <EmptyState
        icon="bi-exclamation-triangle"
        title={m.personalized_status_invalid_title()}
        description={m.personalized_status_invalid_desc()}
      />
    );
  }

  const teamTooltipId = useId();

  const locale = getLocale();
  const weekdayDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }),
    [locale],
  );

  const scheduleConfig = getScheduleConfig(scheduleType);
  const hasTeams = scheduleConfig.shiftConfig.teamCount > 1;

  // NOTE: Intentional exception — do not replace with useShiftCalculation().
  // PersonalizedStatusContent needs minute-level live updates plus the
  // night-shift anchoring/extension behavior, which useShiftCalculation
  // does not provide. Keeping useLiveShiftStatus prevents regressions.
  const { today, currentShift, nextShift, offDayProgress } = useLiveShiftStatus(
    myTeam,
    scheduleType,
  );

  // Calculate next shift start time for countdown
  const nextShiftStartTime = useMemo(() => {
    if (!nextShift || nextShift.shift.start == null) return null;
    return setTimeFromFractionalHour(nextShift.date, nextShift.shift.start);
  }, [nextShift]);

  // Calculate current shift start/end times for progress bar and "Ends in" countdown
  const currentShiftStartTime = useMemo(() => {
    if (!currentShift.shift.isWorking || currentShift.shift.start == null) return null;
    return setTimeFromFractionalHour(currentShift.date, currentShift.shift.start);
  }, [currentShift]);

  const currentShiftEndTime = useMemo(() => {
    const { start, end } = currentShift.shift;
    if (!currentShift.shift.isWorking || end == null) return null;
    // Detect midnight-crossing shifts (e.g., night shift 23h-7h)
    const endDate =
      start != null && start > end ? currentShift.date.add(1, "day") : currentShift.date;
    return setTimeFromFractionalHour(endDate, end);
  }, [currentShift]);

  // Shift progress percentage (elapsed / total duration)
  const shiftProgress = useMemo(() => {
    if (!currentShiftStartTime || !currentShiftEndTime) return null;
    const totalSeconds = currentShiftEndTime.diff(currentShiftStartTime, "second");
    if (totalSeconds <= 0) return null;
    const elapsedSeconds = today.diff(currentShiftStartTime, "second");
    const clampedElapsedSeconds = Math.max(0, elapsedSeconds);
    const percentage = Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100));
    const elapsedHours = Math.floor(clampedElapsedSeconds / 3600);
    const totalHours = Math.round(totalSeconds / 3600);
    return { percentage, elapsedHours, totalHours };
  }, [currentShiftStartTime, currentShiftEndTime, today]);

  const countdown = useCountdown(nextShiftStartTime);
  const shiftStartCountdown = useCountdown(currentShiftStartTime);
  const shiftEndCountdown = useCountdown(currentShiftEndTime);
  const formattedShiftTime = useFormattedShiftTime(currentShift.shift);

  // Tooltip details for current shift badge
  const shiftTooltipDetails = `${currentShift.shift.emoji} ${currentShift.shift.name} shift (${formattedShiftTime})`;

  return (
    <Row>
      <Col md={6}>
        <Card className="h-100">
          <Card.Body className="d-flex flex-column">
            <Card.Title as="h6" className="mb-2 text-primary">
              <i className="bi bi-tag me-1" aria-hidden="true"></i>
              {m.personalized_status_today()}
            </Card.Title>
            <div className="flex-grow-1">
              {hasTeams && (
                <span className="fw-semibold me-1">{m.personalized_status_team({ team: String(myTeam) })}</span>
              )}
              <OverlayTrigger
                placement="bottom"
                overlay={
                  <Tooltip id={teamTooltipId}>
                    <strong>{m.personalized_status_your_team_today()}</strong>
                    <br />
                    {m.personalized_status_code_label()} <strong>{currentShift.shift.displayCode}</strong>
                    <br />
                    {shiftTooltipDetails}
                    <br />
                    <em>{m.personalized_status_full_code({ code: currentShift.code })}</em>
                  </Tooltip>
                }
              >
                <ShiftBadge
                  shift={currentShift.shift}
                  showName
                  size="lg"
                  showTooltip={false}
                  className="cursor-help"
                />
              </OverlayTrigger>
              {currentShift.shift.start != null && currentShift.shift.end != null && (
                <ShiftTimeDisplay shift={currentShift.shift} className="small text-muted mt-1" />
              )}
              {currentShift.shift.isWorking &&
                currentShiftStartTime &&
                !today.isAfter(currentShiftStartTime) && (
                  <CountdownBadge
                    countdown={shiftStartCountdown}
                    startTime={currentShiftStartTime}
                  />
                )}
              {currentShift.shift.isWorking &&
                currentShiftStartTime &&
                today.isAfter(currentShiftStartTime) && (
                  <>
                    <CountdownBadge
                      countdown={shiftEndCountdown}
                      startTime={currentShiftEndTime}
                      label={m.personalized_status_ends_in()}
                      variant="warning"
                    />
                    {shiftProgress && (
                      <div className="mt-2">
                        <div className="small text-muted mb-1">
                          {m.personalized_status_shift_progress({
                            elapsedHours: String(shiftProgress.elapsedHours),
                            totalHours: String(shiftProgress.totalHours),
                          })}
                        </div>
                        <ProgressBar
                          now={shiftProgress.percentage}
                          variant="warning"
                          className="progress-thin"
                          aria-label={
                            shiftProgress.totalHours === 1
                              ? m.personalized_status_shift_progress_aria_one({
                                  elapsedHours: String(shiftProgress.elapsedHours),
                                  totalHours: String(shiftProgress.totalHours),
                                })
                              : m.personalized_status_shift_progress_aria_other({
                                  elapsedHours: String(shiftProgress.elapsedHours),
                                  totalHours: String(shiftProgress.totalHours),
                                })
                          }
                        />
                      </div>
                    )}
                  </>
                )}
              {!currentShift.shift.isWorking && offDayProgress && (
                <div className="mt-2">
                  <div className="small text-muted mb-1">
                    {m.personalized_status_off_day_progress({
                      current: String(offDayProgress.current),
                      total: String(offDayProgress.total),
                    })}
                  </div>
                  <ProgressBar
                    now={(offDayProgress.current / offDayProgress.total) * 100}
                    variant="info"
                    className="progress-thin"
                    aria-label={
                      offDayProgress.total === 1
                        ? m.personalized_status_off_day_progress_aria_one({
                            current: String(offDayProgress.current),
                            total: String(offDayProgress.total),
                          })
                        : m.personalized_status_off_day_progress_aria_other({
                            current: String(offDayProgress.current),
                            total: String(offDayProgress.total),
                          })
                    }
                  />
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
              {m.personalized_status_up_next()}
            </Card.Title>
            <div className="text-muted flex-grow-1">
              {nextShift ? (
                <div>
                  <div className="fw-semibold">
                    {nextShift.date.isSame(today, "day")
                      ? m.today()
                      : nextShift.date.isSame(today.add(1, "day"), "day")
                        ? m.personalized_status_tomorrow()
                                                : weekdayDateFormatter.format(nextShift.date.toDate())}{" "}
                    - {nextShift.shift.name}
                  </div>
                  <ShiftTimeDisplay shift={nextShift.shift} className="small text-muted" />
                  {shiftStartCountdown.isExpired && shiftEndCountdown.isExpired && (
                    <CountdownBadge countdown={countdown} startTime={nextShiftStartTime} urgency />
                  )}
                </div>
              ) : (
                <EmptyState
                  icon="bi-calendar-x"
                  title={m.personalized_status_no_next_title()}
                  description={m.personalized_status_no_next_desc()}
                />
              )}
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
