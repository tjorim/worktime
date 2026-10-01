import { ChartNoAxesColumnIncreasing as ChartNoAxesColumnIncreasingIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { barY, defineChart, ruleY } from "@tanstack/charts";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import * as m from "@/paraglide/messages.js";
import type { WeekDay } from "./hooks/useWeeklyTimeTrackingSummary";

interface DayHoursRow {
  iso: string;
  label: string;
  hours: number;
}

// Spring transition for bar height/position as the week's data changes.
const chartRenderer = motion({
  transition: { type: "spring", stiffness: 170, damping: 22, mass: 1 },
});

interface WeeklyHoursChartProps {
  weekDays: WeekDay[];
  dailyHourTotals: number[];
  todayIso: string;
  targetDaily: number;
}

export function WeeklyHoursChart({
  weekDays,
  dailyHourTotals,
  todayIso,
  targetDaily,
}: WeeklyHoursChartProps) {
  const rows: DayHoursRow[] = weekDays.map((day, index) => ({
    iso: day.iso,
    label: day.label.substring(0, 3),
    hours: dailyHourTotals[index] ?? 0,
  }));

  const definition = defineChart({
    marks: [
      ...(targetDaily > 0
        ? [
            ruleY([targetDaily], {
              stroke: "var(--bs-success)",
              strokeOpacity: 0.7,
              strokeDasharray: "4 3",
            }),
          ]
        : []),
      barY(rows, {
        x: "label",
        y: "hours",
        radius: 4,
        fill: (row) => (row.iso === todayIso ? "var(--bs-primary)" : "var(--bs-secondary)"),
      }),
    ],
    scales: {
      x: {
        scale: () => scaleBand().padding(0.35),
      },
      y: {
        scale: scaleLinear,
        nice: true,
        grid: true,
      },
    },
    tooltip,
  });

  return (
    <div className="tw:mb-4">
      <h6 className="tw:mb-3 tw:text-base tw:font-medium tw:text-muted-foreground tw:uppercase">
        <Icon icon={ChartNoAxesColumnIncreasingIcon} className="tw:mr-2" />
        {m.tt_daily_hours_chart_heading()}
      </h6>
      <div className="tw:min-w-0">
        <Chart
          definition={definition}
          renderer={chartRenderer}
          height={140}
          ariaLabel={m.tt_daily_hours_chart_aria()}
        />
      </div>
      {targetDaily > 0 && (
        <div className="tw:mt-1 tw:text-sm tw:text-muted-foreground">
          <span
            aria-hidden="true"
            className="tw:mr-1 tw:inline-block tw:w-3 tw:border-0 tw:border-t-2 tw:border-dashed tw:border-success-solid tw:align-middle"
          />
          {m.tt_target_label()}: {targetDaily.toFixed(1)} {m.tt_hours_unit()}
        </div>
      )}
    </div>
  );
}
