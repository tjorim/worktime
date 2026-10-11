import { CalendarRange as CalendarRangeIcon } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { Icon } from "@/components/shared/Icon";
import { barY, cell, defineChart, ruleY } from "@tanstack/charts";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";
import type { RecentWeek } from "./hooks/useRecentWeeks";

const chartRenderer = motion({
  transition: { type: "spring", stiffness: 170, damping: 22, mass: 1 },
});

/** Intensity levels of the heatmap: 0 is an empty day, 4 reaches the daily target. */
const HEAT_LEVELS = ["0", "1", "2", "3", "4"] as const;
const HEAT_COLORS = [
  "var(--wt-secondary-bg)",
  "color-mix(in oklab, var(--wt-primary) 25%, var(--wt-secondary-bg))",
  "color-mix(in oklab, var(--wt-primary) 50%, var(--wt-secondary-bg))",
  "color-mix(in oklab, var(--wt-primary) 75%, var(--wt-secondary-bg))",
  "color-mix(in oklab, var(--wt-primary) 100%, var(--wt-secondary-bg))",
];

function heatLevel(hours: number, scaleMax: number): string {
  if (hours <= 0) return "0";
  return String(Math.min(Math.max(Math.ceil((hours / scaleMax) * 4), 1), 4));
}

interface WeekHoursRow {
  week: string;
  hours: number;
  isCurrent: boolean;
}

interface DayHeatRow {
  week: string;
  weekday: string;
  iso: string;
  hours: number;
  level: string;
}

interface RecentWeeksChartsProps {
  /** Oldest first; the last entry is the week being viewed. */
  weeks: RecentWeek[];
  weeklyTargetHours?: number;
  targetDaily: number;
}

function RecentWeeksTrendChart({
  weeks,
  weeklyTargetHours,
}: Pick<RecentWeeksChartsProps, "weeks" | "weeklyTargetHours">) {
  const definition = useMemo(() => {
    const rows: WeekHoursRow[] = weeks.map((week, index) => ({
      week: m.tt_week_short({ week: week.isoWeek }),
      hours: week.hours,
      isCurrent: index === weeks.length - 1,
    }));

    return defineChart({
      marks: [
        ...(weeklyTargetHours && weeklyTargetHours > 0
          ? [
              ruleY([weeklyTargetHours], {
                stroke: "var(--wt-success)",
                strokeOpacity: 0.7,
                strokeDasharray: "4 3",
              }),
            ]
          : []),
        barY(rows, {
          x: "week",
          y: "hours",
          radius: 4,
          fill: (row) => (row.isCurrent ? "var(--wt-primary)" : "var(--wt-secondary)"),
        }),
      ],
      scales: {
        x: {
          scale: () =>
            scaleBand<string>()
              .domain(rows.map((row) => row.week))
              .padding(0.3),
        },
        y: { scale: scaleLinear, nice: true, grid: true },
      },
      tooltip,
    });
  }, [weeks, weeklyTargetHours]);

  return (
    <Chart
      definition={definition}
      renderer={chartRenderer}
      height={160}
      ariaLabel={m.tt_trend_chart_aria({ count: weeks.length })}
    />
  );
}

function RecentWeeksHeatmap({
  weeks,
  targetDaily,
}: Pick<RecentWeeksChartsProps, "weeks" | "targetDaily">) {
  const definition = useMemo(() => {
    const weekdays = Array.from({ length: 7 }, (_, index) =>
      dayjs()
        .isoWeekday(index + 1)
        .format("ddd"),
    );
    const weekLabels = weeks.map((week) => m.tt_week_short({ week: week.isoWeek }));
    const rows: DayHeatRow[] = weeks.flatMap((week, weekIndex) =>
      week.days.map((day) => ({
        week: weekLabels[weekIndex] ?? "",
        weekday: weekdays[day.weekday] ?? "",
        iso: day.iso,
        hours: day.hours,
        level: "0",
      })),
    );
    const scaleMax = Math.max(targetDaily, 1);
    rows.forEach((row) => {
      row.level = heatLevel(row.hours, scaleMax);
    });

    return defineChart({
      marks: [
        cell(rows, {
          x: "week",
          y: "weekday",
          key: (row) => row.iso,
          inset: 1,
          radius: 3,
          color: "level",
        }),
      ],
      scales: {
        x: { scale: () => scaleBand<string>().domain(weekLabels).padding(0.04) },
        y: { scale: () => scaleBand<string>().domain(weekdays).padding(0.04) },
      },
      color: { domain: HEAT_LEVELS, range: HEAT_COLORS },
      tooltip: {
        use: tooltip,
        format: (point) => {
          const row = point.datum as DayHeatRow;
          return `${dayjs(row.iso).format("ddd D MMM")}: ${m.tt_hours_value({ hours: row.hours.toFixed(1) })}`;
        },
      },
    });
  }, [weeks, targetDaily]);

  return (
    <Chart
      definition={definition}
      renderer={chartRenderer}
      height={160}
      ariaLabel={m.tt_trend_heatmap_aria({ count: weeks.length })}
    />
  );
}

/** Weekly totals and a day-by-day heatmap for the weeks leading up to the viewed week. */
export function RecentWeeksCharts({
  weeks,
  weeklyTargetHours,
  targetDaily,
}: RecentWeeksChartsProps) {
  return (
    <div className="mb-4">
      <h6 className="mb-3 text-base font-medium text-muted-foreground uppercase">
        <Icon icon={CalendarRangeIcon} className="mr-2" />
        {m.tt_trend_chart_heading()}
      </h6>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <RecentWeeksTrendChart weeks={weeks} weeklyTargetHours={weeklyTargetHours} />
        </div>
        <div className="min-w-0">
          <RecentWeeksHeatmap weeks={weeks} targetDaily={targetDaily} />
          <div className="mt-1 flex items-center justify-end gap-1 text-sm text-muted-foreground">
            {m.tt_trend_heatmap_less()}
            {HEAT_COLORS.map((color, index) => (
              <span
                key={HEAT_LEVELS[index]}
                aria-hidden="true"
                className="size-3 rounded-xs border border-border bg-(--swatch)"
                style={{ "--swatch": color } as CSSProperties}
              />
            ))}
            {m.tt_trend_heatmap_more()}
          </div>
        </div>
      </div>
    </div>
  );
}
