import {
  CalendarDays as CalendarDaysIcon,
  ChartPie as ChartPieIcon,
  ListChecks as ListChecksIcon,
  Table as TableIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { WORK_LOCATION_ICONS } from "@/components/calendar/workLocationConstants";
import type { WorkLocationMap } from "@/types/workLocation";
import * as m from "@/paraglide/messages.js";
import type { LabelPercentage, WeekDay, WeeklySummary } from "./hooks/useWeeklyTimeTrackingSummary";
import { percent, resolveLabelColors } from "./cssVars";
import { CopyableHoursCell, MetricCard } from "./WeeklyCells";
import { WeeklyHoursChart } from "./WeeklyHoursChart";

const SECTION_HEADING = "tw:mb-3 tw:text-base tw:font-medium tw:text-muted-foreground tw:uppercase";

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

  return (
    <>
      {weeklyTargetHours !== undefined && (
        <div className="tw:mb-4">
          {weeklyTargetHours > 0 ? (
            <>
              <div className="tw:mb-2 tw:flex tw:items-center tw:justify-between">
                <span className="tw:font-semibold">{m.tt_weekly_progress()}</span>
                <span className="tw:text-muted-foreground">
                  {m.tt_hours_value({ hours: weekTotal.toFixed(1) })} /{" "}
                  {m.tt_hours_value({ hours: weeklyTargetHours.toFixed(1) })}
                  <Badge
                    variant={weekTotal >= weeklyTargetHours ? "success" : "secondary"}
                    className="tw:ml-2"
                  >
                    {weekTotal >= weeklyTargetHours
                      ? m.tt_hours_delta({ hours: (weekTotal - weeklyTargetHours).toFixed(1) })
                      : m.tt_hours_remaining({
                          hours: (weeklyTargetHours - weekTotal).toFixed(1),
                        })}
                  </Badge>
                </span>
              </div>
              <div className="tw:flex tw:items-center tw:gap-3">
                <Progress
                  className="tw:min-w-0 tw:flex-1"
                  value={weeklyProgressPercent}
                  aria-label={m.tt_weekly_progress()}
                  trackClassName="tw:h-4"
                  indicatorClassName={
                    weekTotal >= weeklyTargetHours ? "tw:bg-success-solid" : "tw:bg-primary"
                  }
                />
                <span className="tw:w-10 tw:shrink-0 tw:text-right tw:text-sm tw:font-medium tw:tabular-nums">
                  {weeklyProgressPercent.toFixed(0)}%
                </span>
              </div>
            </>
          ) : (
            <div className="tw:mb-2 tw:flex tw:items-center tw:justify-between">
              <span className="tw:font-semibold">{m.tt_weekly_progress()}</span>
              <span className="tw:text-muted-foreground">
                {m.tt_hours_value({ hours: weekTotal.toFixed(1) })} /{" "}
                {m.tt_hours_value({ hours: "0.0" })}
                <Badge variant="secondary" className="tw:ml-2">
                  {m.tt_target_unavailable()}
                </Badge>
              </span>
            </div>
          )}
        </div>
      )}

      <div className="tw:mb-4 tw:grid tw:grid-cols-1 tw:gap-3 tw:sm:grid-cols-2 tw:lg:grid-cols-4">
        <MetricCard
          label={m.tt_total_hours()}
          value={m.tt_hours_value({ hours: weekTotal.toFixed(1) })}
        />
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

      <div className="tw:mb-4">
        <h6 className={SECTION_HEADING}>
          <Icon icon={CalendarDaysIcon} className="tw:mr-2" />
          {m.tt_daily_breakdown()}
        </h6>
        <div className="tw:grid tw:grid-cols-7 tw:gap-2">
          {weekDays.map((day, index) => {
            const dayTotal = dailyHourTotals[index] ?? 0;
            const isToday = day.iso === todayIso;
            const percentage = targetDaily > 0 ? Math.min((dayTotal / targetDaily) * 100, 100) : 0;
            const location = crossBorderEnabled ? (workLocationMap.get(day.iso) ?? null) : null;

            return (
              <div key={day.iso} className="tw:min-w-0">
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
                      "tw:rounded-lg tw:p-2 tw:text-center",
                      isToday && "tw:bg-primary/10",
                      onSwitchToDaily &&
                        "tw:cursor-pointer tw:outline-none tw:hover:bg-muted tw:focus-visible:ring-3 tw:focus-visible:ring-ring/50",
                    )}
                    role={onSwitchToDaily ? "button" : undefined}
                    tabIndex={onSwitchToDaily ? 0 : undefined}
                    onClick={() => onSwitchToDaily?.(day.iso)}
                    onKeyDown={onSwitchToDaily ? createDayKeyDownHandler(day.iso, true) : undefined}
                  >
                    <div
                      className={cn(
                        "tw:mb-1 tw:text-sm",
                        isToday ? "tw:font-bold tw:text-primary" : "tw:text-muted-foreground",
                      )}
                    >
                      {day.label.substring(0, 3)}
                      {isToday && (
                        <Badge className="tw:mx-auto tw:mt-0.5 tw:flex tw:sm:mt-0 tw:sm:ml-1 tw:sm:inline-flex">
                          {m.today()}
                        </Badge>
                      )}
                    </div>
                    <div className="tw:mb-1">
                      <div
                        className="tw:progress-ring tw:mx-auto tw:flex tw:size-10 tw:items-center tw:justify-center tw:rounded-full"
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
                          className="tw:flex tw:size-8 tw:items-center tw:justify-center tw:rounded-full tw:bg-background"
                          aria-hidden="true"
                        >
                          <small className="tw:font-semibold">{dayTotal.toFixed(1)}</small>
                        </div>
                      </div>
                    </div>
                    <div className="tw:text-xs tw:text-muted-foreground">
                      {percentage.toFixed(0)}%
                    </div>
                    {location && (
                      <div className="tw:mt-1 tw:text-xs tw:text-muted-foreground">
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
      </div>

      <div className="tw:mb-4">
        <h6 className={SECTION_HEADING}>
          <Icon icon={TableIcon} className="tw:mr-2" />
          {m.tt_detailed_breakdown()}
        </h6>
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
                <TableRow key={day.iso} className={cn(isToday && "tw:bg-primary/10")}>
                  <TableHead scope="row" className="tw:h-auto tw:p-2">
                    {onSwitchToDaily ? (
                      <Button
                        variant="link"
                        className="tw:h-auto tw:p-0 tw:font-semibold tw:text-foreground tw:hover:no-underline"
                        onClick={() => onSwitchToDaily(day.iso)}
                        aria-label={m.tt_open_daily_log_title({ day: day.label })}
                      >
                        {day.label}
                      </Button>
                    ) : (
                      day.label
                    )}
                    {isToday && <Badge className="tw:ml-2">{m.today()}</Badge>}
                    {location && (
                      <span className="tw:ml-2 tw:text-xs tw:font-normal tw:text-muted-foreground">
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
                    className="tw:font-semibold"
                    cellId={`${day.iso}-total`}
                    cellValue={dayTotal > 0 ? dayTotal.toFixed(2) : null}
                    copiedCellId={copiedCellId}
                    onCopyCell={onCopyCell}
                  />
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {labelPercentages.length > 0 && (
        <div className="tw:mb-4">
          <h6 className={SECTION_HEADING}>
            <Icon icon={ChartPieIcon} className="tw:mr-2" />
            {m.tt_category_breakdown()}
          </h6>
          <div className="tw:grid tw:grid-cols-1 tw:gap-3 tw:md:grid-cols-2 tw:lg:grid-cols-3">
            {labelPercentages.map((item) => {
              const { background, foreground } = resolveLabelColors(item.color);
              const colorVars = {
                "--label-bg": background,
                "--label-fg": foreground,
              } as CSSProperties;
              return (
                <Card key={item.label} className="tw:h-full">
                  <CardContent>
                    <div
                      className="tw:mb-2 tw:flex tw:items-start tw:justify-between"
                      style={colorVars}
                    >
                      <div className="tw:flex tw:items-center">
                        <div
                          className="tw:mr-2 tw:size-3 tw:rounded-xs tw:bg-label"
                          aria-hidden="true"
                        />
                        <span className="tw:font-semibold">{item.label}</span>
                      </div>
                      <Badge variant="secondary">{item.percentage.toFixed(0)}%</Badge>
                    </div>
                    <div className="tw:mb-2 tw:text-xl">
                      {item.hours.toFixed(1)} {m.tt_hours_unit()}
                    </div>
                    <Progress
                      value={Math.min(Math.max(item.percentage, 0), 100)}
                      aria-label={item.label}
                      trackClassName="tw:h-2"
                      indicatorClassName="tw:bg-label"
                      style={colorVars}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <Card className="tw:mt-4">
        <CardContent>
          <h6 className={SECTION_HEADING}>
            <Icon icon={ListChecksIcon} className="tw:mr-2" />
            {m.tt_weekly_summary_heading()}
          </h6>
          <div className="tw:grid tw:grid-cols-1 tw:gap-3 tw:md:grid-cols-2">
            <ul className="tw:m-0 tw:list-none tw:p-0">
              {Object.entries(summary).map(([label, hours]) => (
                <li key={label} className="tw:mb-2">
                  <span className="tw:text-muted-foreground">{label}:</span>{" "}
                  <span className="tw:font-semibold">
                    {hours.toFixed(2)} {m.tt_hours_unit()}
                  </span>
                </li>
              ))}
            </ul>
            <div>
              <div className="tw:text-xl">
                {m.tt_total_label()}:{" "}
                <span className="tw:text-primary">
                  {weekTotal.toFixed(2)} {m.tt_hours_unit()}
                </span>
              </div>
              {weeklyTargetHours !== undefined && (
                <div className="tw:text-muted-foreground">
                  {m.tt_target_label()}: {weeklyTargetHours.toFixed(1)} {m.tt_hours_unit()}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
