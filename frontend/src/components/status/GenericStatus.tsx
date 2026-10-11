import { Grid, GridItem } from "@/components/ui/grid";
import {
  Calendar as CalendarIcon,
  CalendarX as CalendarXIcon,
  CircleArrowRight as CircleArrowRightIcon,
  CircleCheck as CircleCheckIcon,
  Lightbulb as LightbulbIcon,
  MoonStar as MoonStarIcon,
  Users as UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

import { Progress } from "@/components/ui/progress";

import type { ScheduleOption } from "@/data/rosters";
import { getScheduleConfig } from "@/utils/scheduleUtils";
import { useCountdown } from "@/hooks/useCountdown";
import { dayjs, setTimeFromFractionalHour } from "@/utils/dateTimeUtils";
import { getLocale } from "@/paraglide/runtime.js";
import type { UpcomingShiftResult, ShiftResult } from "@/utils/shiftCalculations";
import { getAllTeamsShifts, getCurrentWorkingTeam } from "@/utils/shiftCalculations";
import { ShiftTimeDisplay } from "@/components/shared/ShiftTimeDisplay";
import { CountdownBadge } from "@/components/shared/CountdownBadge";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import { EmptyState } from "@/components/shared/EmptyState";
import * as m from "@/paraglide/messages.js";

interface GenericStatusContentProps {
  scheduleType: ScheduleOption;
  /** Render a single-line summary instead of the full status/next-activity cards. */
  compact?: boolean;
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
export function GenericStatusContent({ scheduleType, compact = false }: GenericStatusContentProps) {
  const scheduleConfig = getScheduleConfig(scheduleType);
  const hasTeams = scheduleConfig.shiftConfig.teamCount > 1;
  const locale = getLocale();

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
    const offTeams = allTeamsToday.length - workingTeams;
    const pluralRules = new Intl.PluralRules(locale);
    const workingLabel =
      pluralRules.select(workingTeams) === "one"
        ? m.generic_status_working_count_one({ count: String(workingTeams) })
        : m.generic_status_working_count_other({ count: String(workingTeams) });
    const offLabel =
      pluralRules.select(offTeams) === "one"
        ? m.generic_status_off_count_one({ count: String(offTeams) })
        : m.generic_status_off_count_other({ count: String(offTeams) });

    return {
      workingTeams,
      offTeams,
      workingLabel,
      offLabel,
    };
  }, [hasTeams, scheduleType, todayMinuteKey, locale]); // oxlint-disable-line react-hooks/exhaustive-deps -- dependencies intentionally use minute key for stable updates

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

  if (compact) {
    return (
      <div className="flex items-center gap-2 flex-wrap ">
        {currentWorkingTeam ? (
          <>
            {hasTeams && (
              <span className="font-semibold ">
                {m.generic_status_team_label({ team: String(currentWorkingTeam.teamNumber) })}
              </span>
            )}
            <span>
              <ShiftBadge
                shift={currentWorkingTeam.shift}
                showEmoji
                showName
                size="sm"
                showTooltip={false}
              />
            </span>
            <ShiftTimeDisplay
              shift={currentWorkingTeam.shift}
              className="text-sm text-muted-foreground"
            />
            {shiftEndCountdown && !shiftEndCountdown.isExpired && (
              <span className="text-sm text-warning">
                {m.generic_status_ends_in()} {shiftEndCountdown.formatted}
              </span>
            )}
          </>
        ) : nextShiftAnyTeam && countdown && !countdown.isExpired ? (
          <span className="text-sm text-muted-foreground">
            {m.current_status_next_in({ time: countdown.formatted })}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{m.generic_status_no_teams_title()}</span>
        )}
      </div>
    );
  }

  return (
    <Grid>
      <GridItem desktopSpan={6}>
        <Card className="h-full">
          <CardContent className="flex grow flex-col">
            <CardTitle className="mb-2 text-link">
              <Icon icon={hasTeams ? UsersIcon : CalendarIcon} className="mr-1" />
              {m.schedule_current_status()}
            </CardTitle>
            <div className="grow">
              {currentWorkingTeam ? (
                <div>
                  {hasTeams && (
                    <span className="font-semibold mr-1">
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
                    className="text-sm text-muted-foreground mt-1"
                  />
                  <div className="text-sm text-success mt-2">
                    <Icon icon={CircleCheckIcon} className="mr-1" />
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
                          <div className="text-sm text-muted-foreground mb-1">
                            {shiftProgress.remainingHours > 0
                              ? m.generic_status_shift_progress_remaining({
                                  hours: String(shiftProgress.remainingHours),
                                  minutes: String(shiftProgress.remainingMinutes),
                                })
                              : m.generic_status_shift_progress_remaining_minutes_only({
                                  minutes: String(shiftProgress.remainingMinutes),
                                })}
                          </div>
                          <Progress
                            indicatorClassName="bg-warning"
                            value={shiftProgress.percentage}

                            aria-label={
                              shiftProgress.remainingHours > 0
                                ? m.generic_status_shift_progress_remaining_aria({
                                    hours: String(shiftProgress.remainingHours),
                                    minutes: String(shiftProgress.remainingMinutes),
                                  })
                                : m.generic_status_shift_progress_remaining_minutes_only_aria({
                                    minutes: String(shiftProgress.remainingMinutes),
                                  })
                            }
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <EmptyState
                  icon={MoonStarIcon}
                  title={m.generic_status_no_teams_title()}
                  description={m.generic_status_no_teams_desc()}
                />
              )}
              {teamsSummary && (
                <div className="mt-4">
                  <Badge variant="info">
                    {m.generic_status_working_off_summary({
                      working: teamsSummary.workingLabel,
                      off: teamsSummary.offLabel,
                    })}
                  </Badge>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </GridItem>
      <GridItem desktopSpan={6}>
        <Card className="h-full">
          <CardContent className="flex grow flex-col">
            <CardTitle className="mb-2 text-success">
              <Icon icon={CircleArrowRightIcon} className="mr-1" />
              {m.generic_status_next_activity()}
            </CardTitle>
            <div className="text-muted-foreground grow">
              {nextShiftAnyTeam ? (
                <div>
                  <div className="font-semibold">
                    {hasTeams
                      ? `${m.generic_status_team_label({ team: String(nextShiftAnyTeam.teamNumber) })} `
                      : ""}
                    {typeof (nextShiftAnyTeam.date as { toDate?: () => Date }).toDate === "function"
                      ? new Intl.DateTimeFormat(locale, {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        }).format((nextShiftAnyTeam.date as { toDate: () => Date }).toDate())
                      : nextShiftAnyTeam.date.format("ddd, MMM D")}{" "}
                    - {nextShiftAnyTeam.shift.name}
                  </div>
                  <ShiftTimeDisplay
                    shift={nextShiftAnyTeam.shift}
                    className="text-sm text-muted-foreground"
                  />
                  <CountdownBadge countdown={countdown} startTime={nextShiftStartTime} />
                </div>
              ) : (
                <EmptyState
                  icon={CalendarXIcon}
                  title={m.generic_status_no_upcoming_title()}
                  description={m.generic_status_no_upcoming_desc()}
                />
              )}
            </div>
          </CardContent>
        </Card>
      </GridItem>
      {hasTeams && (
        <GridItem span={12} className="mt-4">
          <div className="text-sm text-muted-foreground text-center">
            <Icon icon={LightbulbIcon} className="mr-1" />
            {m.generic_status_select_team_hint()}
          </div>
        </GridItem>
      )}
    </Grid>
  );
}
