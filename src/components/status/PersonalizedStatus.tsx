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
  getNextShift,
  getOffDayProgress,
  getShiftCode,
} from "../../utils/shiftCalculations";
import { ShiftTimeDisplay } from "../shared/ShiftTimeDisplay";
import { CountdownBadge } from "../shared/CountdownBadge";
import { ShiftBadge } from "../shared/ShiftBadge";

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

  const today = dayjs();
  const todayMinuteKey = today.startOf("minute").toISOString();

  // Calculate current shift for today
  const currentShift = useMemo((): ShiftResult => {
    const shift = calculateShift(today, myTeam, scheduleType);
    return {
      date: today,
      shift,
      code: getShiftCode(today, myTeam, scheduleType),
      teamNumber: myTeam,
    };
  }, [myTeam, todayMinuteKey, scheduleType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate next shift
  const nextShift = useMemo((): UpcomingShiftResult | null => {
    return getNextShift(today, myTeam, scheduleType);
  }, [myTeam, todayMinuteKey, scheduleType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate off-day progress when team is off
  const offDayProgress = useMemo((): OffDayProgress | null => {
    return getOffDayProgress(today, myTeam, scheduleType);
  }, [myTeam, todayMinuteKey, scheduleType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calculate next shift start time for countdown
  const nextShiftStartTime = useMemo(() => {
    if (!nextShift || nextShift.shift.start == null) return null;
    return setTimeFromFractionalHour(nextShift.date, nextShift.shift.start);
  }, [nextShift]);

  const countdown = useCountdown(nextShiftStartTime);
  const formattedShiftTime = useFormattedShiftTime(currentShift.shift);

  // Tooltip details for current shift badge
  const shiftTooltipDetails = `${currentShift.shift.emoji} ${currentShift.shift.name} shift (${formattedShiftTime})`;

  return (
    <Row>
      <Col md={6}>
        <Card className="h-100">
          <Card.Body className="d-flex flex-column">
            <Card.Title as="h6" className="mb-2 text-primary">
              🏷️ Your Team Status
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
              <i className="bi bi-arrow-right-circle me-1"></i>
              Your Next Shift
            </Card.Title>
            <div className="text-muted flex-grow-1">
              {nextShift ? (
                <div>
                  <div className="fw-semibold">
                    {nextShift.date.format("ddd, MMM D")} - {nextShift.shift.name}
                  </div>
                  <ShiftTimeDisplay shift={nextShift.shift} className="small text-muted" />
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
  );
}
