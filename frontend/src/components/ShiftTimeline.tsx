import { Clock as ClockIcon, Radio as RadioIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useId } from "react";
import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";
import clsx from "clsx";
import { useSettings } from "@/contexts/SettingsContext";
import { useFormattedShiftTime } from "@/hooks/useFormattedShiftTime";
import { shiftColors, ShiftBadge } from "@/components/shared/ShiftBadge";
import type { ShiftResult } from "@/utils/shiftCalculations";
import type { ScheduleOption } from "@/data/rosters";
import { getAllTeamsShifts } from "@/utils/shiftCalculations";
import { getTeamCountForOption } from "@/utils/scheduleUtils";
import * as m from "@/paraglide/messages.js";

interface TimelineData {
  prevShift: ShiftResult | null;
  currentShift: ShiftResult;
  nextShift: ShiftResult | null;
  workingTeams: ShiftResult[];
}

/**
 * Build a timeline of working shifts and identify the previous and next shifts relative to the provided current working team.
 *
 * The shift day is derived from `currentWorkingTeam.date`. If the current team is the first working shift of the day, the previous shift (if any) is taken from the last working shift of the previous day. If the current team is the last working shift of the day, the next shift (if any) is taken from the first working shift of the following day.
 *
 * @param currentWorkingTeam - The team currently active, from which the shift day is derived
 * @param scheduleOption - The schedule configuration to use
 * @returns An object with `prevShift`, `nextShift`, and `currentShift` for the shift day
 */
function computeShiftTimeline(
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
      workingTeams,
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
    workingTeams,
  };
}

/**
 * Check if multiple teams have the same shift start time (parallel shifts)
 * @param teams Array of ShiftResult objects (should be pre-filtered to working teams only)
 * @returns true if teams work simultaneously (same start time), false if sequential
 */
function hasTeamsWithSameStartTime(teams: ShiftResult[]): boolean {
  // Filter to only teams with valid start times (excludes "Off" shifts with null start)
  const teamsWithStart = teams.filter((t) => t.shift.start !== null);
  if (teamsWithStart.length <= 1) return false;

  const startTimes = new Set(teamsWithStart.map((t) => t.shift.start));
  // If number of teams > number of unique start times, there are parallel shifts
  return teamsWithStart.length > startTimes.size;
}

interface ShiftTimelineProps {
  currentWorkingTeam: ShiftResult;
}

/**
 * Render today's horizontal shift timeline highlighting the previous, current and next working teams.
 *
 * Shows the previous and next working teams when available and a highlighted current team badge with tooltips for shift details and live updates.
 *
 * @param currentWorkingTeam - The ShiftResult representing the currently active team
 * @returns A React element that displays the shift timeline UI
 */
export function ShiftTimeline({ currentWorkingTeam }: ShiftTimelineProps) {
  // Generate unique ID for tooltip to avoid HTML ID conflicts
  const timelineTooltipId = useId();
  const { scheduleType } = useSettings();
  const formattedShiftTime = useFormattedShiftTime(currentWorkingTeam.shift);

  if (!scheduleType) {
    throw new Error("ShiftTimeline requires a schedule to be selected");
  }

  // Scenario 1: Single-team schedule - hide timeline (use roster config, not working teams count)
  const rosterTeamCount = getTeamCountForOption(scheduleType);
  if (rosterTeamCount === 1) {
    return null;
  }

  const { prevShift, nextShift, workingTeams } = computeShiftTimeline(
    currentWorkingTeam,
    scheduleType,
  );

  // Scenario 2: Check for parallel shifts (teams with same start time)
  const hasParallelShifts = hasTeamsWithSameStartTime(workingTeams);
  // Accessibility: use a stable id for the header and reference it with aria-labelledby
  const timelineHeaderId = "shift-timeline-header";
  return (
    <div
      className=" tw:rounded-xl tw:border tw:border-border tw:bg-card tw:p-4 tw:mt-2"
      role="region"
      aria-labelledby={timelineHeaderId}
    >
      <div className="tw:font-semibold tw:text-base tw:mb-3 tw:text-center" id={timelineHeaderId}>
        <Icon icon={ClockIcon} className="tw:mr-2" />
        {m.shift_timeline_title()}
      </div>
      <div
        data-timeline-flow
        className="tw:flex tw:gap-4 tw:items-center tw:justify-center tw:flex-wrap"
      >
        {prevShift && (
          <div data-timeline-team className="tw:flex tw:flex-col tw:items-center tw:gap-2">
            <Badge
              variant="secondary"
              className="tw:min-w-10 tw:h-auto tw:text-sm tw:font-semibold tw:rounded-md"
            >
              T{prevShift.teamNumber}
            </Badge>
            <div className="tw:text-sm tw:font-semibold tw:text-muted-foreground">
              <ShiftBadge shift={prevShift.shift} size="sm" />
            </div>
          </div>
        )}
        {prevShift && !hasParallelShifts && (
          <span data-timeline-arrow className="tw:text-muted-foreground tw:text-xl tw:font-bold">
            →
          </span>
        )}
        <div data-timeline-team className="tw:flex tw:flex-col tw:items-center tw:gap-2">
          <Hint
            placement="bottom"
            content={
              <div id={timelineTooltipId}>
                <strong>{m.timeline_currently_active()}</strong>
                <br />
                {currentWorkingTeam.shift.name}
                <br />
                {formattedShiftTime}
              </div>
            }
          >
            <Badge
              data-current-team
              className={clsx(
                shiftColors[currentWorkingTeam.shift.className],
                "tw:cursor-help tw:text-base tw:font-semibold tw:shadow-sm",
                "tw:min-w-10 tw:h-auto tw:text-sm tw:font-semibold tw:rounded-md",
              )}
            >
              T{currentWorkingTeam.teamNumber}
            </Badge>
          </Hint>
          <div className="tw:text-sm tw:font-semibold tw:text-muted-foreground">
            <ShiftBadge shift={currentWorkingTeam.shift} size="sm" showTooltip={false} />
            <Hint
              placement="bottom"
              content={
                <div id={`${timelineTooltipId}-live`}>
                  <strong>{m.shift_timeline_live_updates_title()}</strong>
                  <br />
                  {m.shift_timeline_live_updates_desc()}
                </div>
              }
            >
              <Icon
                icon={RadioIcon}
                className="tw:text-success tw:motion-safe:animate-pulse tw:ml-1"
              />
            </Hint>
          </div>
        </div>
        {nextShift && !hasParallelShifts && (
          <span data-timeline-arrow className="tw:text-muted-foreground tw:text-xl tw:font-bold">
            →
          </span>
        )}
        {nextShift && (
          <div data-timeline-team className="tw:flex tw:flex-col tw:items-center tw:gap-2">
            <Badge
              variant="secondary"
              className="tw:min-w-10 tw:h-auto tw:text-sm tw:font-semibold tw:rounded-md"
            >
              T{nextShift.teamNumber}
            </Badge>
            <div className="tw:text-sm tw:font-semibold tw:text-muted-foreground">
              <ShiftBadge shift={nextShift.shift} size="sm" />
            </div>
          </div>
        )}
      </div>
      {hasParallelShifts && (
        <div className="tw:text-center tw:mt-2">
          <small className="tw:text-muted-foreground">{m.shift_timeline_parallel_note()}</small>
        </div>
      )}
    </div>
  );
}
