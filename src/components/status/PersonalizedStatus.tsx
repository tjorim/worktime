import { useId, useMemo } from "react";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import type { ScheduleOption } from "../../data/rosters";
import { getScheduleConfig } from "../../utils/scheduleUtils";
import { useCountdown } from "../../hooks/useCountdown";
import { useFormattedShiftTime } from "../../hooks/useFormattedShiftTime";
import { dayjs, setTimeFromFractionalHour } from "../../utils/dateTimeUtils";
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
  getShiftCode,
  isCurrentlyWorking,
} from "../../utils/shiftCalculations";
import { ShiftTimeDisplay } from "../shared/ShiftTimeDisplay";
import { CountdownBadge } from "../shared/CountdownBadge";
import { ShiftBadge } from "../shared/ShiftBadge";
import { EmptyState } from "../shared/EmptyState";

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
  const teamTooltipId = useId();

  const scheduleConfig = getScheduleConfig(scheduleType);
  const hasTeams = scheduleConfig.shiftConfig.teamCount > 1;

  const todayMinuteKey = dayjs().startOf("minute").toISOString();
  const today = useMemo(() => dayjs(todayMinuteKey), [todayMinuteKey]);

  // NOTE: This component intentionally does NOT use useShiftCalculation().
  // The hook uses a static dayjs() at mount time and simpler shift logic
  // (currentShift anchored to the calendar date, nextShift anchored to currentDate).
  // Here we need (1) a live-updating `today` that re-evaluates every minute, and
  // (2) the night-shift extension logic below (Cases A/B) that anchors both
  // currentShift and nextShift to shiftDay when the user is still inside the
  // previous night's shift window. Using the hook would silently break that logic.

  // Resolve the shift day anchor used for both shift lookup and next-shift search.
  // During night shift early-morning hours (before nightShiftEnd, e.g. before 07:00),
  // getCurrentShiftDay returns the previous calendar day.
  const shiftDay = useMemo(() => getCurrentShiftDay(today, scheduleType), [today, scheduleType]);

  // Determine the current shift, handling two distinct cases:
  //
  // Case A – Night-shift extension (e.g. T2 at 06:22 still in the 23:00–07:00 shift):
  //   shiftDay = yesterday, shiftDayShift = Night, isCurrentlyWorking = true
  //   → use shiftDay as the date so start/end times anchor to the correct night.
  //
  // Case B – Shift not yet started or regular daytime (e.g. T5 at 06:22, Morning starts 07:00):
  //   shiftDay = yesterday, shiftDayShift = Off, isCurrentlyWorking = false
  //   → fall back to the calendar date so the upcoming shift is displayed correctly.
  //
  // Also covers 9-5 schedules (no night shift ⇒ shiftDay always equals today).
  const currentShift = useMemo((): ShiftResult => {
    const shiftDayShift = calculateShift(shiftDay, myTeam, scheduleType);
    const isInNightShiftExtension =
      shiftDayShift.isWorking && isCurrentlyWorking(shiftDayShift, shiftDay, today, scheduleType);

    if (isInNightShiftExtension) {
      return {
        date: shiftDay,
        shift: shiftDayShift,
        // Use shiftDay (not today) so the code is derived from the same date as the
        // shift object. Using today would call calculateShift(today) internally, which
        // returns Off on the calendar day after the last night in a series — producing
        // a mismatched code like "…O" while the shift name still shows "Night".
        code: getShiftCode(shiftDay, myTeam, scheduleType),
        teamNumber: myTeam,
      };
    }

    const shift = calculateShift(today, myTeam, scheduleType);
    return {
      date: today,
      shift,
      code: getShiftCode(today, myTeam, scheduleType),
      teamNumber: myTeam,
    };
  }, [myTeam, shiftDay, today, scheduleType]);

  // Anchor next-shift search from shiftDay (not calendar day) so that:
  // - Night shift extension: search starts from yesterday → finds any remaining
  //   consecutive night shift or the first post-night working day.
  // - Pre-shift (e.g. 06:22, Morning at 07:00): search starts from yesterday →
  //   finds today's upcoming shift and shows "Starts in Xm".
  const nextShift = useMemo((): UpcomingShiftResult | null => {
    return getNextShift(shiftDay, myTeam, scheduleType);
  }, [myTeam, shiftDay, scheduleType]);

  // Calculate off-day progress when team is off
  // getOffDayProgress calls getCurrentShiftDay internally, so passing today is fine.
  const offDayProgress = useMemo((): OffDayProgress | null => {
    return getOffDayProgress(today, myTeam, scheduleType);
  }, [myTeam, today, scheduleType]);

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
  }, [currentShiftStartTime, currentShiftEndTime, todayMinuteKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
              Today
            </Card.Title>
            <div className="flex-grow-1">
              {hasTeams && <span className="fw-semibold me-1">Team {myTeam}:</span>}
              <OverlayTrigger
                placement="bottom"
                overlay={
                  <Tooltip id={teamTooltipId}>
                    <strong>Your Team Today</strong>
                    <br />
                    Code: <strong>{currentShift.shift.displayCode}</strong>
                    <br />
                    {shiftTooltipDetails}
                    <br />
                    <em>Full code: {currentShift.code}</em>
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
                      label="Ends in"
                      variant="warning"
                    />
                    {shiftProgress && (
                      <div className="mt-2">
                        <div className="small text-muted mb-1">
                          Shift Progress: {shiftProgress.elapsedHours}h / {shiftProgress.totalHours}
                          h
                        </div>
                        <ProgressBar
                          now={shiftProgress.percentage}
                          variant="warning"
                          className="progress-thin"
                          aria-label={`Shift progress: ${shiftProgress.elapsedHours} of ${shiftProgress.totalHours} hours`}
                        />
                      </div>
                    )}
                  </>
                )}
              {!currentShift.shift.isWorking && offDayProgress && (
                <div className="mt-2">
                  <div className="small text-muted mb-1">
                    Off Day Progress: Day {offDayProgress.current} of {offDayProgress.total}
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
          </Card.Body>
        </Card>
      </Col>
      <Col md={6}>
        <Card className="h-100">
          <Card.Body className="d-flex flex-column">
            <Card.Title as="h6" className="mb-2 text-success">
              <i className="bi bi-arrow-right-circle me-1" aria-hidden="true"></i>
              Up Next
            </Card.Title>
            <div className="text-muted flex-grow-1">
              {nextShift ? (
                <div>
                  <div className="fw-semibold">
                    {nextShift.date.isSame(today, "day")
                      ? "Today"
                      : nextShift.date.isSame(today.add(1, "day"), "day")
                        ? "Tomorrow"
                        : nextShift.date.format("ddd, MMM D")}{" "}
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
                  title="No Next Shift"
                  description="No upcoming shifts found for your team."
                />
              )}
            </div>
          </Card.Body>
        </Card>
      </Col>
    </Row>
  );
}
