import { Grid, GridItem } from "@/components/ui/grid";
import {
  Briefcase as BriefcaseIcon,
  CalendarDays as CalendarDaysIcon,
  ChartColumn as ChartColumnIcon,
  ChartPie as ChartPieIcon,
  Circle as CircleIcon,
  Clock as ClockIcon,
  House as HouseIcon,
  Info as InfoIcon,
  Moon as MoonIcon,
  Sun as SunIcon,
  Sunset as SunsetIcon,
  Users as UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import clsx from "clsx";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import type { ScheduleOption, ShiftCode } from "@/data/rosters";
import { useSettings } from "@/contexts/SettingsContext";
import { getScheduleConfig } from "@/utils/scheduleUtils";
import { dayjs, getLocalizedShiftTime } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";

import { calculateShift } from "@/utils/shiftCalculations";

// Display metadata for each working shift code — icons, colors, and variants only (labels are translated at render time).
// Any shift code present in a schedule's shiftTimes but absent here will receive a generic fallback.
const SHIFT_DISPLAY_META: Partial<
  Record<
    ShiftCode,
    {
      icon: LucideIcon;
      iconClassName: string;
      variant: "warning" | "info" | "default" | "secondary";
    }
  >
> = {
  M: {
    icon: SunIcon,
    iconClassName: "text-warning",
    variant: "warning",
  },
  L: {
    icon: SunsetIcon,
    iconClassName: "text-info",
    variant: "info",
  },
  D: {
    icon: SunIcon,
    iconClassName: "text-primary",
    variant: "default",
  },
  N: {
    icon: MoonIcon,
    iconClassName: "text-muted-foreground",
    variant: "secondary",
  },
};

function getShiftLabel(code: ShiftCode): string {
  switch (code) {
    case "M":
      return m.shift_morning_shifts();
    case "L":
      return m.shift_evening_shifts();
    case "D":
      return m.shift_day_shifts();
    case "N":
      return m.shift_night_shifts();
    default:
      return m.shift_generic_shifts({ code });
  }
}

function getLocalizedScheduleMetadata(scheduleType: ScheduleOption) {
  switch (scheduleType) {
    case "9-5":
      return { title: m.schedule_9_5_title(), description: m.schedule_9_5_description() };
    case "2-shift":
      return { title: m.schedule_2_shift_title(), description: m.schedule_2_shift_description() };
    case "weekend-shift":
      return {
        title: m.schedule_weekend_shift_title(),
        description: m.schedule_weekend_shift_description(),
      };
    case "5-shift":
      return { title: m.schedule_5_shift_title(), description: m.schedule_5_shift_description() };
  }
}

interface ScheduleDetailModalProps {
  show: boolean;
  onHide: () => void;
  teamNumber: number;
  scheduleType: ScheduleOption;
}

/**
 * Render a modal showing schedule details - team schedule for multi-team schedules, or user schedule for single-user schedules.
 *
 * Works with any schedule type - automatically adapts to single-user or multi-team schedules.
 * Displays the current shift and next shift, a day-by-day schedule with shift times,
 * and weekly statistics (working/rest days and shift distribution).
 *
 * @param teamNumber - Team number to display (for multi-team schedules) or 1 (for single-user schedules)
 * @param scheduleType - Schedule type for cross-schedule viewing
 * @returns The modal element for the specified team or schedule
 */
export function ScheduleDetailModal({
  show,
  onHide,
  teamNumber,
  scheduleType,
}: ScheduleDetailModalProps) {
  const { settings } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const scheduleMetadata = getLocalizedScheduleMetadata(scheduleType);
  const teamCount = scheduleConfig.shiftConfig.teamCount;
  const hasTeams = teamCount > 1;
  const isValidTeamNumber = hasTeams
    ? teamNumber >= 1 && teamNumber <= teamCount
    : teamNumber === 1;
  if (!isValidTeamNumber) {
    throw new Error(
      `Invalid team number: ${teamNumber}. Expected ${hasTeams ? `1-${teamCount}` : "1"}`,
    );
  }

  // Current date key for daily recalculation
  const currentDateKey = dayjs().format("YYYY-MM-DD");

  // Generate 7-day schedule for the team
  const weekSchedule = useMemo(() => {
    const today = dayjs();
    const schedule = [];

    for (let i = 0; i < 7; i++) {
      const date = today.add(i, "day");
      // Use calendar date directly for schedule display, not shift day
      // This ensures the schedule shows the correct day even before 7 AM
      const shift = calculateShift(date, teamNumber, scheduleType);

      schedule.push({
        date,
        shift,
        isToday: i === 0,
        isTomorrow: i === 1,
      });
    }

    return schedule;
  }, [teamNumber, currentDateKey, scheduleType]); // oxlint-disable-line react/exhaustive-deps -- currentDateKey forces daily recalculation even if modal stays open past midnight

  // Calculate team statistics
  const stats = useMemo(() => {
    const workingDays = weekSchedule.filter((day) => day.shift.code !== "O").length;
    const offDays = 7 - workingDays;
    const totalWeeklyHours = weekSchedule.reduce((sum, day) => {
      if (day.shift.start === null || day.shift.end === null) {
        return sum;
      }

      const duration =
        day.shift.end > day.shift.start
          ? day.shift.end - day.shift.start
          : 24 - day.shift.start + day.shift.end;

      return sum + duration;
    }, 0);

    const shiftDistribution = (Object.keys(scheduleConfig.shiftConfig.shiftTimes) as ShiftCode[])
      .filter((code) => code !== "O")
      .map((code) => {
        const count = weekSchedule.filter((day) => day.shift.code === code).length;
        const meta = SHIFT_DISPLAY_META[code] ?? {
          icon: CircleIcon,
          iconClassName: "text-muted-foreground",
          variant: "secondary" as const,
        };
        return { key: code, ...meta, count };
      });

    return {
      workingDays,
      offDays,
      totalWeeklyHours,
      shiftDistribution,
    };
  }, [weekSchedule, scheduleConfig.shiftConfig.shiftTimes]);

  // Find current status (weekSchedule always has 7 elements)
  const currentStatus = weekSchedule[0]!;
  const nextShift = weekSchedule.find((day) => day.shift.code !== "O" && !day.isToday);
  const availableShifts = (
    Object.entries(scheduleConfig.shiftConfig.shiftTimes) as Array<
      [ShiftCode, (typeof scheduleConfig.shiftConfig.shiftTimes)[ShiftCode]]
    >
  ).filter(([code, definition]) => code !== "O" && definition !== undefined);

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>
            <Icon
              icon={hasTeams ? UsersIcon : CalendarDaysIcon}
              className={clsx("mr-2", "text-primary")}
            />
            {hasTeams
              ? m.schedule_detail_title_team({ team: String(teamNumber) })
              : m.schedule_detail_title_schedule()}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-4">
          {/* Current Status Card */}
          <Card className="mb-6">
            <CardContent>
              <div className="flex flex-wrap gap-2 justify-between items-center">
                <div>
                  <h6 className="mb-1">
                    <Icon icon={ClockIcon} className="mr-2" />
                    {m.schedule_current_status()}
                  </h6>
                  <div className="flex items-center gap-2">
                    {currentStatus.shift.code === "O" ? (
                      <Badge variant="secondary">
                        <Icon icon={HouseIcon} className="mr-1" />
                        {m.schedule_off_duty()}
                      </Badge>
                    ) : (
                      <ShiftBadge shift={currentStatus.shift} showName pill showTooltip={false} />
                    )}
                    <small className="text-muted-foreground">
                      {currentStatus.date.format("dddd, MMM D")}
                    </small>
                  </div>
                </div>
                {nextShift && (
                  <div className="text-right">
                    <small className="text-muted-foreground block">{m.schedule_next_shift()}</small>
                    <ShiftBadge shift={nextShift.shift} showName pill showTooltip={false} />
                    <small className="text-muted-foreground block">
                      {nextShift.date.format("MMM D")}
                    </small>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardContent>
              <h6 className="mb-4">
                <Icon icon={InfoIcon} className="mr-2" />
                {m.schedule_info_heading()}
              </h6>
              <Grid className="gap-4">
                <GridItem span={6} desktopSpan={3}>
                  <small className="text-muted-foreground block">{m.schedule_info_type()}</small>
                  <span className="font-semibold">{scheduleMetadata.title}</span>
                </GridItem>
                {hasTeams ? (
                  <GridItem span={6} desktopSpan={3}>
                    <small className="text-muted-foreground block">{m.schedule_info_team()}</small>
                    <span className="font-semibold">
                      {m.schedule_info_team_value({
                        team: String(teamNumber),
                        total: String(teamCount),
                      })}
                    </span>
                  </GridItem>
                ) : null}
                <GridItem span={6} desktopSpan={3}>
                  <small className="text-muted-foreground block">{m.schedule_info_cycle()}</small>
                  <span className="font-semibold">
                    {m.schedule_info_cycle_days({
                      days: String(scheduleConfig.shiftConfig.cycleLengthDays),
                    })}
                  </span>
                </GridItem>
                <GridItem span={6} desktopSpan={3}>
                  <small className="text-muted-foreground block">
                    {m.schedule_info_shifts_per_day()}
                  </small>
                  <span className="font-semibold">{scheduleConfig.shiftConfig.shiftsPerDay}</span>
                </GridItem>
                <GridItem span={12}>
                  <small className="text-muted-foreground block mb-2">
                    {m.schedule_info_available_shifts()}
                  </small>
                  <div className="flex flex-wrap gap-2">
                    {availableShifts.map(([code, definition]) => {
                      const meta = SHIFT_DISPLAY_META[code] ?? { variant: "secondary" };
                      return (
                        <Badge key={code} variant={meta.variant} className="font-normal">
                          {definition?.displayCode ?? code}
                          <span className="ml-1">
                            {getLocalizedShiftTime(
                              definition?.start ?? null,
                              definition?.end ?? null,
                              settings.timeFormat,
                            )}
                          </span>
                        </Badge>
                      );
                    })}
                  </div>
                </GridItem>
                <GridItem span={12}>
                  <small className="text-muted-foreground block">
                    {m.schedule_info_description()}
                  </small>
                  <span>{scheduleMetadata.description}</span>
                </GridItem>
              </Grid>
            </CardContent>
          </Card>

          {/* 7-Day Schedule */}
          <div className="mb-6">
            <h6 className="mb-4">
              <Icon icon={CalendarDaysIcon} className="mr-2" />
              {m.schedule_7day_heading()}
            </h6>

            {/* Desktop table view */}
            <div className="hidden md:block">
              <div className="overflow-x-auto">
                <Table
                  className="mb-0 [&_th]:bg-muted [&_th]:p-3 [&_td]:p-3 [&_tr]:border-b [&_tr]:border-border [&_tbody_tr]:hover:bg-muted/50"
                  aria-label={
                    hasTeams
                      ? m.schedule_7day_aria_team({ team: String(teamNumber) })
                      : m.schedule_7day_aria_personal()
                  }
                >
                  <TableHeader>
                    <TableRow>
                      <TableHead>{m.schedule_col_date()}</TableHead>
                      <TableHead>{m.schedule_col_day()}</TableHead>
                      <TableHead>{m.schedule_col_shift()}</TableHead>
                      <TableHead>{m.schedule_col_hours()}</TableHead>
                      <TableHead>{m.schedule_col_status()}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {weekSchedule.map((day) => (
                      <TableRow
                        key={day.date.format("YYYY-MM-DD")}
                        className={clsx(day.isToday && "bg-primary/10 font-medium")}
                      >
                        <TableCell>
                          <strong>{day.date.format("MMM D")}</strong>
                          {day.isToday && (
                            <Badge variant="default" className="ml-2">
                              <Icon icon={CircleIcon} className="mr-1 size-2" fill="currentColor" />
                              {m.today()}
                            </Badge>
                          )}
                          {day.isTomorrow && (
                            <Badge variant="info" className="ml-2">
                              {m.schedule_tomorrow()}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{day.date.format("ddd")}</TableCell>
                        <TableCell>
                          {day.shift.code === "O" ? (
                            <Badge variant="secondary">{m.schedule_off()}</Badge>
                          ) : (
                            <ShiftBadge shift={day.shift} showName pill showTooltip={false} />
                          )}
                        </TableCell>
                        <TableCell>
                          <small className="text-muted-foreground">
                            {day.shift.code === "O"
                              ? "—"
                              : (getLocalizedShiftTime(
                                  day.shift.start,
                                  day.shift.end,
                                  settings.timeFormat,
                                ) ?? "—")}
                          </small>
                        </TableCell>
                        <TableCell>
                          {day.shift.code === "O" ? (
                            <small className="text-muted-foreground">
                              <Icon icon={HouseIcon} className="mr-1" />
                              {m.schedule_rest_day()}
                            </small>
                          ) : (
                            <small className="text-success">
                              <Icon icon={BriefcaseIcon} className="mr-1" />
                              {m.schedule_working()}
                            </small>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden">
              {weekSchedule.map((day) => (
                <Card
                  key={day.date.format("YYYY-MM-DD")}
                  className={clsx(
                    "mb-4",
                    day.isToday && "border-primary shadow-sm ring-2 ring-primary bg-primary/10",
                  )}
                >
                  <CardContent className="py-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h6 className="mb-1">
                          {day.date.format("dddd")}
                          {day.isToday && (
                            <Badge variant="default" className="ml-2">
                              <Icon icon={CircleIcon} className="mr-1 size-2" fill="currentColor" />
                              {m.today()}
                            </Badge>
                          )}
                          {day.isTomorrow && (
                            <Badge variant="info" className="ml-2">
                              {m.schedule_tomorrow()}
                            </Badge>
                          )}
                        </h6>
                        <small className="text-muted-foreground">
                          {day.date.format("MMMM D, YYYY")}
                        </small>
                      </div>
                      <div>
                        {day.shift.code === "O" ? (
                          <Badge variant="secondary">{m.schedule_off()}</Badge>
                        ) : (
                          <ShiftBadge shift={day.shift} showName pill showTooltip={false} />
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-between items-center pt-2 border-t border-border">
                      <div>
                        <small className="text-muted-foreground block">
                          <Icon icon={ClockIcon} className="mr-1" />
                          {m.schedule_col_hours()}
                        </small>
                        <span className="text-foreground">
                          {day.shift.code === "O"
                            ? "—"
                            : (getLocalizedShiftTime(
                                day.shift.start,
                                day.shift.end,
                                settings.timeFormat,
                              ) ?? "—")}
                        </span>
                      </div>
                      <div className="text-right">
                        <small className="text-muted-foreground block">
                          {m.schedule_col_status()}
                        </small>
                        {day.shift.code === "O" ? (
                          <span className="text-muted-foreground">
                            <Icon icon={HouseIcon} className="mr-1" />
                            {m.schedule_rest_day()}
                          </span>
                        ) : (
                          <span className="text-success">
                            <Icon icon={BriefcaseIcon} className="mr-1" />
                            {m.schedule_working()}
                          </span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Team Statistics */}
          <Grid className="mb-6">
            <GridItem desktopSpan={6}>
              <Card>
                <CardContent>
                  <h6 className="mb-4">
                    <Icon icon={ChartColumnIcon} className="mr-2" />
                    {m.schedule_weekly_stats()}
                  </h6>
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2 justify-between items-center mb-2">
                      <span className="font-semibold">{m.schedule_working_vs_rest()}</span>
                      <small className="text-muted-foreground">
                        {m.schedule_stats_summary({
                          working: String(stats.workingDays),
                          rest: String(stats.offDays),
                        })}
                      </small>
                    </div>
                    <div className="space-y-2">
                      <Progress
                        indicatorClassName="bg-success"
                        value={(stats.workingDays / 7) * 100}
                        aria-label={m.schedule_working_label({ count: String(stats.workingDays) })}
                      >
                        <span className="text-sm">
                          {m.schedule_working_label({ count: String(stats.workingDays) })}
                        </span>
                      </Progress>
                      <Progress
                        indicatorClassName="bg-muted-foreground"
                        value={(stats.offDays / 7) * 100}
                        aria-label={m.schedule_rest_label({ count: String(stats.offDays) })}
                      >
                        <span className="text-sm">
                          {m.schedule_rest_label({ count: String(stats.offDays) })}
                        </span>
                      </Progress>
                    </div>
                  </div>
                  <ul className="list-none pl-0 mb-0 divide-y divide-border">
                    <li className="px-0 py-2 flex justify-between">
                      <span>
                        <Icon icon={ClockIcon} className="mr-1" />
                        {m.schedule_total_weekly_hours()}
                      </span>
                      <Badge variant="default">
                        {Number.isInteger(stats.totalWeeklyHours)
                          ? `${stats.totalWeeklyHours}h`
                          : `${stats.totalWeeklyHours.toFixed(1)}h`}
                      </Badge>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </GridItem>
            <GridItem desktopSpan={6}>
              <Card>
                <CardContent>
                  <h6 className="mb-4">
                    <Icon icon={ChartPieIcon} className="mr-2" />
                    {m.schedule_shift_distribution()}
                  </h6>
                  <div className="mb-4 space-y-2">
                    {stats.shiftDistribution
                      .filter((item) => item.count > 0)
                      .map((item) => (
                        <div key={item.key}>
                          <span className="text-sm text-muted-foreground">
                            {getShiftLabel(item.key)}
                          </span>
                          <Progress
                            value={(item.count / 7) * 100}
                            aria-label={getShiftLabel(item.key)}
                          />
                        </div>
                      ))}
                  </div>
                  <ul className="list-none pl-0 mb-0 divide-y divide-border">
                    {stats.shiftDistribution.map((item) => (
                      <li key={item.key} className="px-0 py-2 flex justify-between">
                        <span>
                          <Icon icon={item.icon} className={clsx("mr-1", item.iconClassName)} />
                          {getShiftLabel(item.key)}
                        </span>
                        <Badge variant={item.variant}>
                          {item.count}/7 ({Math.round((item.count / 7) * 100)}%)
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </GridItem>
          </Grid>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onHide}>
            {m.close()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
