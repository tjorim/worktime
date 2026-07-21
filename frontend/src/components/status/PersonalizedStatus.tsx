import { useId, useMemo } from "react";
import Card from "react-bootstrap/Card";
import Col from "react-bootstrap/Col";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import ProgressBar from "react-bootstrap/ProgressBar";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import type { ScheduleOption } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import { getScheduleConfig, isValidScheduleType } from "@/utils/scheduleUtils";
import { useCountdown } from "@/hooks/useCountdown";
import { useFormattedShiftTime } from "@/hooks/useFormattedShiftTime";
import { useLiveShiftStatus } from "@/hooks/useLiveShiftStatus";
import { useTodayActualStart } from "@/hooks/useTodayActualStart";
import { useFlexStartOverride } from "@/hooks/useFlexStartOverride";
import { formatTimeByPreference, setTimeFromFractionalHour } from "@/utils/dateTimeUtils";
import { getFlexEndFromStart, getFlexEndRange, getFlexWindow } from "@/utils/flexShift";
import { getLocale } from "@/paraglide/runtime.js";
import { FlexStartEditor } from "./FlexStartEditor";
import { ShiftTimeDisplay } from "@/components/shared/ShiftTimeDisplay";
import { CountdownBadge } from "@/components/shared/CountdownBadge";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import * as m from "@/paraglide/messages.js";

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
  const locale = getLocale();
  const { settings } = useSettings();
  const weekdayDateFormatter = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }),
    [locale],
  );

  if (!isValidScheduleType(scheduleType)) {
    return (
      <EmptyState
        icon="bi-exclamation-triangle"
        title={m.personalized_status_invalid_title()}
        description={m.personalized_status_invalid_desc()}
      />
    );
  }

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

  // Flex-time handling: for shifts with a flex window (e.g. the 9-5 Day shift),
  // anchor the finish to the actual clock-in plus a flat presence span instead
  // of the nominal roster end. This avoids showing "2 hours left" at 15:30 to
  // someone who started at 07:00 and can already go home.
  const flexWindow = useMemo(() => getFlexWindow(currentShift.shift), [currentShift.shift]);
  const actualStart = useTodayActualStart(currentShift.date);
  const manualStart = useFlexStartOverride(currentShift.date);
  const isFlexShift = flexWindow != null && currentShift.shift.isWorking;

  // A logged time-tracking clock-in is authoritative; otherwise fall back to a
  // manual "I started at ..." override. Either drives a real countdown/progress.
  const flexStartTime = isFlexShift ? (actualStart ?? manualStart.startTime) : null;
  // Only offer the manual editor when time-tracking is not already providing
  // the start (editing it would have no effect while a clock-in exists).
  const showFlexEditor = isFlexShift && !actualStart;
  const flexEndTime = useMemo(
    () =>
      flexStartTime && flexWindow
        ? getFlexEndFromStart(flexStartTime, flexWindow.presenceHours)
        : null,
    [flexStartTime, flexWindow],
  );
  // No clock-in yet: show the possible leave range instead of a false countdown.
  const flexEndRange = useMemo(
    () =>
      isFlexShift && flexWindow && !flexStartTime
        ? getFlexEndRange(currentShift.date, flexWindow)
        : null,
    [isFlexShift, flexWindow, flexStartTime, currentShift.date],
  );

  const effectiveStartTime = isFlexShift ? flexStartTime : currentShiftStartTime;
  const effectiveEndTime = isFlexShift ? flexEndTime : currentShiftEndTime;

  // Shift progress percentage (elapsed / total duration)
  const shiftProgress = useMemo(() => {
    if (!effectiveStartTime || !effectiveEndTime) return null;
    const totalSeconds = effectiveEndTime.diff(effectiveStartTime, "second");
    if (totalSeconds <= 0) return null;
    const elapsedSeconds = today.diff(effectiveStartTime, "second");
    const clampedElapsedSeconds = Math.max(0, elapsedSeconds);
    const percentage = Math.min(100, Math.max(0, (elapsedSeconds / totalSeconds) * 100));
    // For flex shifts the presence span is fixed (e.g. 8.5h), so show the total
    // verbatim and give elapsed matching one-decimal precision — otherwise a
    // fully-elapsed flex shift would read "8h / 8.5h".
    const elapsedHours =
      isFlexShift && flexWindow
        ? Math.round(clampedElapsedSeconds / 360) / 10
        : Math.floor(clampedElapsedSeconds / 3600);
    const totalHours =
      isFlexShift && flexWindow ? flexWindow.presenceHours : Math.round(totalSeconds / 3600);
    return { percentage, elapsedHours, totalHours };
  }, [effectiveStartTime, effectiveEndTime, today, isFlexShift, flexWindow]);

  const flexHourLabel = (fractionalHour: number) =>
    formatTimeByPreference(setTimeFromFractionalHour(today, fractionalHour), settings.timeFormat);

  const countdown = useCountdown(nextShiftStartTime);
  const shiftStartCountdown = useCountdown(effectiveStartTime);
  const shiftEndCountdown = useCountdown(effectiveEndTime);
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
                <span className="fw-semibold me-1">
                  {m.personalized_status_team({ team: String(myTeam) })}
                </span>
              )}
              <OverlayTrigger
                placement="bottom"
                overlay={
                  <Tooltip id={teamTooltipId}>
                    <strong>{m.personalized_status_your_team_today()}</strong>
                    <br />
                    {m.personalized_status_code_label()}{" "}
                    <strong>{currentShift.shift.displayCode}</strong>
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
              {currentShift.shift.start != null &&
                currentShift.shift.end != null &&
                !isFlexShift && (
                  <ShiftTimeDisplay shift={currentShift.shift} className="small text-muted mt-1" />
                )}
              {isFlexShift && flexWindow && (
                <div className="small text-muted mt-1">
                  <i className="bi bi-hourglass-split me-1" aria-hidden="true"></i>
                  {m.personalized_status_flex_window({
                    earliest: flexHourLabel(flexWindow.earliestStart),
                    latest: flexHourLabel(flexWindow.latestStart),
                    hours: String(flexWindow.presenceHours),
                  })}
                </div>
              )}
              {isFlexShift && flexStartTime && flexEndTime && (
                <div className="small text-muted mt-1">
                  <i className="bi bi-box-arrow-in-right me-1" aria-hidden="true"></i>
                  {m.personalized_status_flex_clocked({
                    start: formatTimeByPreference(flexStartTime, settings.timeFormat),
                    end: formatTimeByPreference(flexEndTime, settings.timeFormat),
                  })}
                </div>
              )}
              {isFlexShift && flexEndRange && (
                <div className="mt-2">
                  <span className="fw-semibold">
                    <i className="bi bi-box-arrow-right me-1" aria-hidden="true"></i>
                    {m.personalized_status_flex_leave_range({
                      earliest: formatTimeByPreference(
                        flexEndRange.earliestEnd,
                        settings.timeFormat,
                      ),
                      latest: formatTimeByPreference(flexEndRange.latestEnd, settings.timeFormat),
                    })}
                  </span>
                  {settings.enableTimeTracking && (
                    <div className="small text-muted mt-1">
                      {m.personalized_status_flex_leave_hint()}
                    </div>
                  )}
                </div>
              )}
              {currentShift.shift.isWorking &&
                effectiveStartTime &&
                !today.isAfter(effectiveStartTime) && (
                  <CountdownBadge countdown={shiftStartCountdown} startTime={effectiveStartTime} />
                )}
              {currentShift.shift.isWorking &&
                effectiveStartTime &&
                today.isAfter(effectiveStartTime) && (
                  <>
                    <CountdownBadge
                      countdown={shiftEndCountdown}
                      startTime={effectiveEndTime}
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
              {showFlexEditor && flexWindow && (
                <div className="mt-2">
                  <FlexStartEditor
                    startTime={manualStart.startTime}
                    defaultInputTime={setTimeFromFractionalHour(
                      currentShift.date,
                      flexWindow.earliestStart,
                    ).format("HH:mm")}
                    onSet={manualStart.setStartTime}
                    onClear={manualStart.clear}
                  />
                </div>
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
                        : typeof (nextShift.date as { toDate?: () => Date }).toDate === "function"
                          ? weekdayDateFormatter.format(
                              (nextShift.date as { toDate: () => Date }).toDate(),
                            )
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
