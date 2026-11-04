import {
  CalendarDaysIcon,
  CalendarRangeIcon,
  ChartColumnStackedIcon,
  ChartPieIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WORK_LOCATION_ICONS } from "@/components/calendar/workLocationConstants";
import type { WorkLocationMap } from "@/types/workLocation";
import * as m from "@/paraglide/messages.js";
import type { LabelPercentage, WeekDay, WeeklySummary } from "./hooks/useWeeklyTimeTrackingSummary";
import { percent, resolveLabelColors } from "./cssVars";
import { CopyableHoursCell, MetricCard } from "./WeeklyCells";
import { WeeklyHoursChart } from "./WeeklyHoursChart";
import { WeeklyLabelChart } from "./WeeklyLabelChart";
import { RecentWeeksCharts } from "./RecentWeeksCharts";
import type { RecentWeek } from "./hooks/useRecentWeeks";

const SECTION_HEADING = "mb-3 text-base font-medium text-muted-foreground uppercase";

/** One collapsed block of the weekly detail: its title stays visible, its body mounts on demand. */
function WeeklyDetail({
  value,
  icon,
  title,
  children,
}: {
  value: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="text-base text-muted-foreground uppercase">
        <span>
          <Icon icon={icon} className="mr-2" />
          {title}
        </span>
      </AccordionTrigger>
      <AccordionContent className="pt-2 text-base">{children}</AccordionContent>
    </AccordionItem>
  );
}

interface WeeklyDataViewProps {
  weekTotal: number;
  weeklyTargetHours?: number;
  weeklyProgressPercent: number;
  avgDailyHours: number;
  dailyHourTotals: number[];
  labelPercentages: LabelPercentage[];
  weekDays: WeekDay[];
  todayIso: string;
  targetDaily: number;
  crossBorderEnabled: boolean;
  workLocationMap: WorkLocationMap;
  onSwitchToDaily?: (date: string) => void;
  pluralRules: Intl.PluralRules;
  labelNames: string[];
  dailyTotals: Record<string, WeeklySummary>;
  copiedCellId: string | null;
  onCopyCell: (id: string, value: string) => void;
  summary: WeeklySummary;
  /** Oldest first, ending with the viewed week. Omit to hide the recent-weeks charts. */
  recentWeeks?: RecentWeek[];
}

export function WeeklyDataView({
  weekTotal,
  weeklyTargetHours,
  weeklyProgressPercent,
  avgDailyHours,
  dailyHourTotals,
  labelPercentages,
  weekDays,
  todayIso,
  targetDaily,
  crossBorderEnabled,
  workLocationMap,
  onSwitchToDaily,
  pluralRules,
  labelNames,
  dailyTotals,
  copiedCellId,
  onCopyCell,
  summary,
  recentWeeks,
}: WeeklyDataViewProps) {
  const createDayKeyDownHandler =
    (dayIso: string, preventEnterDefault: boolean) => (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        if (e.key === " " || preventEnterDefault) {
          e.preventDefault();
        }
        onSwitchToDaily?.(dayIso);
      }
    };

  const showTotalTile = !(weeklyTargetHours !== undefined && weeklyTargetHours > 0);

  return (
    <>
      {weeklyTargetHours !== undefined && (
        <div className="mb-4">
          {weeklyTargetHours > 0 ? (
            <>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-semibold">{m.tt_weekly_progress()}</span>
                <span className="text-muted-foreground">
                  {m.tt_hours_value({ hours: weekTotal.toFixed(1) })} /{" "}
                  {m.tt_hours_value({ hours: weeklyTargetHours.toFixed(1) })}
                  <Badge
                    variant={weekTotal >= weeklyTargetHours ? "success" : "secondary"}
                    className="ml-2"
                  >
                    {weekTotal >= weeklyTargetHours
                      ? m.tt_hours_delta({ hours: (weekTotal - weeklyTargetHours).toFixed(1) })
                      : m.tt_hours_remaining({
                          hours: (weeklyTargetHours - weekTotal).toFixed(1),
                        })}
                  </Badge>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Progress
                  className="min-w-0 flex-1"
                  value={weeklyProgressPercent}
                  aria-label={m.tt_weekly_progress()}
                  trackClassName="h-4"
                  indicatorClassName={
                    weekTotal >= weeklyTargetHours ? "bg-success-solid" : "bg-primary"
                  }
                />
                <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">
                  {weeklyProgressPercent.toFixed(0)}%
                </span>
              </div>
            </>
          ) : (
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold">{m.tt_weekly_progress()}</span>
              <span className="text-muted-foreground">{m.tt_no_target_week()}</span>
            </div>
          )}
        </div>
      )}

      <div
        className={cn(
          "mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2",
          // The progress bar above already states the total against the target.
          showTotalTile ? "lg:grid-cols-4" : "lg:grid-cols-3",
        )}
      >
        {showTotalTile && (
          <MetricCard
            label={m.tt_total_hours()}
            value={m.tt_hours_value({ hours: weekTotal.toFixed(1) })}
          />
        )}
        <MetricCard
          label={m.tt_avg_daily_hours()}
          value={m.tt_hours_value({ hours: avgDailyHours.toFixed(1) })}
        />
        <MetricCard
          label={m.tt_days_tracked()}
          value={String(dailyHourTotals.filter((h) => h > 0).length)}
        />
        <MetricCard
          label={m.tt_top_category()}
          value={labelPercentages[0]?.label ?? "-"}
          truncate
        />
      </div>

      <WeeklyHoursChart
        weekDays={weekDays}
        dailyHourTotals={dailyHourTotals}
        todayIso={todayIso}
        targetDaily={targetDaily}
      />

      {labelPercentages.length > 0 && (
        <div className="mb-4">
          <h6 className={SECTION_HEADING}>
            <Icon icon={ChartPieIcon} className="mr-2" />
            {m.tt_category_breakdown()}
          </h6>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {labelPercentages.map((item) => {
              const { background, foreground } = resolveLabelColors(item.color);
              const colorVars = {
                "--label-bg": background,
                "--label-fg": foreground,
              } as CSSProperties;
              return (
                <Card key={item.label} className="h-full">
                  <CardContent>
                    <div className="mb-2 flex items-start justify-between" style={colorVars}>
                      <div className="flex items-center">
                        <div className="mr-2 size-3 rounded-xs bg-label" aria-hidden="true" />
                        <span className="font-semibold">{item.label}</span>
                      </div>
                      <Badge variant="secondary">{item.percentage.toFixed(0)}%</Badge>
                    </div>
                    <div className="mb-2 text-xl">
                      {item.hours.toFixed(1)} {m.tt_hours_unit()}
                    </div>
                    <Progress
                      value={Math.min(Math.max(item.percentage, 0), 100)}
                      aria-label={item.label}
                      trackClassName="h-2"
                      indicatorClassName="bg-label"
                      style={colorVars}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Accordion multiple className="mt-2 border-t border-border">
        {recentWeeks && recentWeeks.length > 0 && (
          <WeeklyDetail value="recent" icon={CalendarRangeIcon} title={m.tt_trend_chart_heading()}>
            <RecentWeeksCharts
              showHeading={false}
              weeks={recentWeeks}
              weeklyTargetHours={weeklyTargetHours}
              targetDaily={targetDaily}
            />
          </WeeklyDetail>
        )}

        <WeeklyDetail value="daily" icon={CalendarDaysIcon} title={m.tt_daily_breakdown()}>
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((day, index) => {
              const dayTotal = dailyHourTotals[index] ?? 0;
              const isToday = day.iso === todayIso;
              const percentage =
                targetDaily > 0 ? Math.min((dayTotal / targetDaily) * 100, 100) : 0;
              const location = crossBorderEnabled ? (workLocationMap.get(day.iso) ?? null) : null;

              return (
                <div key={day.iso} className="min-w-0">
                  <Hint
                    disabled={!onSwitchToDaily}
                    content={
                      <div id={`weekly-day-${day.iso}`}>
                        {m.tt_open_daily_log_title({ day: day.label })}
                      </div>
                    }
                  >
                    <div
                      className={cn(
                        "rounded-lg p-2 text-center",
                        isToday && "bg-primary/10",
                        onSwitchToDaily &&
                          "cursor-pointer outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
                      )}
                      role={onSwitchToDaily ? "button" : undefined}
                      tabIndex={onSwitchToDaily ? 0 : undefined}
                      onClick={() => onSwitchToDaily?.(day.iso)}
                      onKeyDown={
                        onSwitchToDaily ? createDayKeyDownHandler(day.iso, true) : undefined
                      }
                    >
                      <div
                        className={cn(
                          "mb-1 text-sm",
                          isToday ? "font-bold text-primary" : "text-muted-foreground",
                        )}
                      >
                        {day.label.substring(0, 3)}
                        {isToday && (
                          <Badge className="mx-auto mt-0.5 flex sm:mt-0 sm:ml-1 sm:inline-flex">
                            {m.today()}
                          </Badge>
                        )}
                      </div>
                      <div className="mb-1">
                        <div
                          className="progress-ring mx-auto flex size-10 items-center justify-center rounded-full"
                          role="img"
                          data-complete={percentage >= 100}
                          aria-label={
                            pluralRules.select(dayTotal) === "one"
                              ? m.tt_weekly_chart_aria_one({
                                  day: day.label,
                                  hours: dayTotal.toFixed(1),
                                  percent: percentage.toFixed(0),
                                })
                              : m.tt_weekly_chart_aria({
                                  day: day.label,
                                  hours: dayTotal.toFixed(1),
                                  percent: percentage.toFixed(0),
                                })
                          }
                          style={{ "--ring-pct": percent(percentage) } as CSSProperties}
                        >
                          <div
                            className="flex size-8 items-center justify-center rounded-full bg-background"
                            aria-hidden="true"
                          >
                            <small className="font-semibold">{dayTotal.toFixed(1)}</small>
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">{percentage.toFixed(0)}%</div>
                      {location && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <Icon icon={WORK_LOCATION_ICONS[location.location]} />{" "}
                          {location.countryCode}
                        </div>
                      )}
                    </div>
                  </Hint>
                </div>
              );
            })}
          </div>
        </WeeklyDetail>

        <WeeklyDetail value="table" icon={TableIcon} title={m.tt_detailed_breakdown()}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{m.tt_col_day()}</TableHead>
                {labelNames.map((label) => (
                  <TableHead key={label} scope="col">
                    {label}
                  </TableHead>
                ))}
                <TableHead scope="col">{m.tt_col_total_hours()}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {weekDays.map((day, index) => {
                const daySummary = dailyTotals[day.iso] ?? {};
                const dayTotal = dailyHourTotals[index] ?? 0;
                const isToday = day.iso === todayIso;
                const location = crossBorderEnabled ? (workLocationMap.get(day.iso) ?? null) : null;
                return (
                  <TableRow key={day.iso} className={cn(isToday && "bg-primary/10")}>
                    <TableHead scope="row" className="h-auto p-2">
                      {onSwitchToDaily ? (
                        <Button
                          variant="link"
                          className="h-auto p-0 font-semibold text-foreground hover:no-underline"
                          onClick={() => onSwitchToDaily(day.iso)}
                          aria-label={m.tt_open_daily_log_title({ day: day.label })}
                        >
                          {day.label}
                        </Button>
                      ) : (
                        day.label
                      )}
                      {isToday && <Badge className="ml-2">{m.today()}</Badge>}
                      {location && (
                        <span className="ml-2 text-xs font-normal text-muted-foreground">
                          <Icon icon={WORK_LOCATION_ICONS[location.location]} />{" "}
                          {location.countryCode}
                        </span>
                      )}
                    </TableHead>
                    {labelNames.map((label) => {
                      const hours = daySummary[label] ?? 0;
                      const cellId = `${day.iso}-${label}`;
                      const cellValue = hours > 0 ? hours.toFixed(2) : null;
                      return (
                        <CopyableHoursCell
                          key={cellId}
                          cellId={cellId}
                          cellValue={cellValue}
                          copiedCellId={copiedCellId}
                          onCopyCell={onCopyCell}
                        />
                      );
                    })}
                    <CopyableHoursCell
                      className="font-semibold"
                      cellId={`${day.iso}-total`}
                      cellValue={dayTotal > 0 ? dayTotal.toFixed(2) : null}
                      copiedCellId={copiedCellId}
                      onCopyCell={onCopyCell}
                    />
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableHead scope="row" className="h-auto p-2">
                  {m.tt_total_label()}
                </TableHead>
                {labelNames.map((label) => {
                  const hours = summary[label] ?? 0;
                  const cellId = `total-${label}`;
                  return (
                    <CopyableHoursCell
                      key={cellId}
                      className="font-semibold"
                      cellId={cellId}
                      cellValue={hours > 0 ? hours.toFixed(2) : null}
                      copiedCellId={copiedCellId}
                      onCopyCell={onCopyCell}
                    />
                  );
                })}
                <CopyableHoursCell
                  className="font-semibold text-primary"
                  cellId="total-week"
                  cellValue={weekTotal > 0 ? weekTotal.toFixed(2) : null}
                  copiedCellId={copiedCellId}
                  onCopyCell={onCopyCell}
                />
              </TableRow>
            </TableFooter>
          </Table>
        </WeeklyDetail>

        {labelPercentages.length > 0 && (
          <WeeklyDetail
            value="label-chart"
            icon={ChartColumnStackedIcon}
            title={m.tt_label_chart_heading()}
          >
            <WeeklyLabelChart
              showHeading={false}
              weekDays={weekDays}
              dailyTotals={dailyTotals}
              labelPercentages={labelPercentages}
              targetDaily={targetDaily}
            />
          </WeeklyDetail>
        )}
      </Accordion>
    </>
  );
}
