import type { Dayjs } from "dayjs";
import { useId } from "react";
import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useSettings } from "../contexts/SettingsContext";
import type { ShiftResult } from "../utils/shiftCalculations";
import type { ScheduleOption } from "../data/rosters";
import {
  getAllTeamsShifts,
  getShiftByCode,
  getShiftDisplay,
  getFormattedShiftTime,
} from "../utils/shiftCalculations";

interface TimelineData {
  prevShift: ShiftResult | null;
  currentShift: ShiftResult;
  nextShift: ShiftResult | null;
}

/**
 * Build a timeline of working shifts for the given day and identify the previous and next shifts relative to the provided current working team.
 *
 * If the current team is the first working shift of the day, the previous shift (if any) is taken from the last working shift of the previous day. If the current team is the last working shift of the day, the next shift (if any) is taken from the first working shift of the following day.
 *
 * @param _today - The reference date (calendar day) - not used; shift day is derived from currentWorkingTeam.date
 * @param currentWorkingTeam - The team currently active within today's shifts
 * @param scheduleOption - The schedule configuration to use
 * @returns An object with `prevShift` set to the adjacent previous working shift or `null`, `currentShift` equal to `currentWorkingTeam`, and `nextShift` set to the adjacent next working shift or `null`
 */
function computeShiftTimeline(
  _today: Dayjs,
  currentWorkingTeam: ShiftResult,
  scheduleOption?: ScheduleOption | null,
): TimelineData {
  // Use the shift day from currentWorkingTeam instead of calendar day
  // This is crucial for night shifts which use the previous calendar day as their shift day
  const shiftDay = currentWorkingTeam.date;

  // Get all teams for the shift day to build timeline
  const allTeamsToday = getAllTeamsShifts(shiftDay, scheduleOption);
  const workingTeams = allTeamsToday.filter((team) => team.shift.isWorking);

  // Sort by shift start time to create timeline
  const timeline = workingTeams.sort((a, b) => {
    const startA = a.shift.start || 0;
    const startB = b.shift.start || 0;
    return startA - startB;
  });

  const currentIndex = timeline.findIndex(
    (team) => team.teamNumber === currentWorkingTeam.teamNumber,
  );

  // Handle case when current team is not found in timeline (should not happen in normal operation)
  if (currentIndex === -1) {
    return {
      prevShift: null,
      currentShift: currentWorkingTeam,
      nextShift: null,
    };
  }

  let prevShift: ShiftResult | null = null;

  // Check if there's a previous shift in today's timeline
  if (currentIndex > 0) {
    prevShift = timeline[currentIndex - 1] ?? null;
  } else {
    // Current shift is the first of the day, look at yesterday's last shift
    const yesterday = shiftDay.subtract(1, "day");
    const allTeamsYesterday = getAllTeamsShifts(yesterday, scheduleOption);
    const workingTeamsYesterday = allTeamsYesterday.filter((team) => team.shift.isWorking);

    if (workingTeamsYesterday.length > 0) {
      // Sort yesterday's shifts and get the last one (latest start time)
      const yesterdayTimeline = workingTeamsYesterday.sort((a, b) => {
        const startA = a.shift.start || 0;
        const startB = b.shift.start || 0;
        return startB - startA; // Descending order to get latest first
      });
      prevShift = yesterdayTimeline[0] ?? null;
    }
  }

  let nextShift: ShiftResult | null = null;

  // Check if there's a next shift in today's timeline
  if (currentIndex < timeline.length - 1) {
    nextShift = timeline[currentIndex + 1] ?? null;
  } else {
    // Current shift is the last of the day, look at tomorrow's first shift
    const tomorrow = shiftDay.add(1, "day");
    const allTeamsTomorrow = getAllTeamsShifts(tomorrow, scheduleOption);
    const workingTeamsTomorrow = allTeamsTomorrow.filter((team) => team.shift.isWorking);

    if (workingTeamsTomorrow.length > 0) {
      // Sort tomorrow's shifts and get the first one (earliest start time)
      const tomorrowTimeline = workingTeamsTomorrow.sort((a, b) => {
        const startA = a.shift.start || 0;
        const startB = b.shift.start || 0;
        return startA - startB;
      });
      nextShift = tomorrowTimeline[0] ?? null;
    }
  }

  return {
    prevShift,
    currentShift: currentWorkingTeam,
    nextShift,
  };
}

interface ShiftTimelineProps {
  currentWorkingTeam: ShiftResult;
  today: Dayjs;
}

/**
 * Render today's horizontal shift timeline highlighting the previous, current and next working teams.
 *
 * Shows the previous and next working teams when available and a highlighted current team badge with tooltips for shift details and live updates.
 *
 * @param currentWorkingTeam - The ShiftResult representing the currently active team
 * @param today - The Dayjs date used to compute the timeline for the current day
 * @returns A React element that displays the shift timeline UI
 */
export function ShiftTimeline({ currentWorkingTeam, today }: ShiftTimelineProps) {
  // Generate unique ID for tooltip to avoid HTML ID conflicts
  const timelineTooltipId = useId();
  const { settings, scheduleOption } = useSettings();
  const { prevShift, nextShift } = computeShiftTimeline(today, currentWorkingTeam, scheduleOption);

  return (
    <div className="card-timeline timeline-container">
      <div className="timeline-header text-center">
        <i className="bi bi-clock me-2" aria-hidden="true"></i>
        Today's Shift Timeline
      </div>
      <div className="d-flex timeline-flow flex-wrap">
        {prevShift && (
          <div className="timeline-team">
            <Badge bg="light" text="dark" className="timeline-badge">
              T{prevShift.teamNumber}
            </Badge>
            <div className="timeline-code">
              {getShiftDisplay(prevShift.shift, scheduleOption).displayCode}
            </div>
          </div>
        )}
        {prevShift && <span className="timeline-arrow">→</span>}
        <div className="timeline-team">
          <OverlayTrigger
            placement="bottom"
            overlay={
              <Tooltip id={timelineTooltipId}>
                <strong>Currently Active</strong>
                <br />
                {getShiftDisplay(currentWorkingTeam.shift, scheduleOption).displayName}
                <br />
                {getFormattedShiftTime(
                  currentWorkingTeam.shift,
                  scheduleOption,
                  settings.timeFormat,
                )}
              </Tooltip>
            }
          >
            <Badge
              className={`${getShiftByCode(currentWorkingTeam.shift.code).className} timeline-current-badge timeline-badge`}
            >
              T{currentWorkingTeam.teamNumber}
            </Badge>
          </OverlayTrigger>
          <div className="timeline-code">
            {getShiftDisplay(currentWorkingTeam.shift, scheduleOption).displayCode}
            <OverlayTrigger
              placement="bottom"
              overlay={
                <Tooltip id={`${timelineTooltipId}-live`}>
                  <strong>📡 Live Updates</strong>
                  <br />
                  Data refreshes every minute
                </Tooltip>
              }
            >
              <i className="bi bi-broadcast text-success live-indicator ms-1"></i>
            </OverlayTrigger>
          </div>
        </div>
        {nextShift && <span className="timeline-arrow">→</span>}
        {nextShift && (
          <div className="timeline-team">
            <Badge bg="light" text="dark" className="timeline-badge">
              T{nextShift.teamNumber}
            </Badge>
            <div className="timeline-code">
              {getShiftDisplay(nextShift.shift, scheduleOption).displayCode}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
