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
    <div className="mb-4">
      <h6 className="text-uppercase text-muted mb-3">
        <i className="bi bi-bar-chart-line me-2" aria-hidden="true"></i>
        {m.tt_daily_hours_chart_heading()}
      </h6>
      <div style={{ minWidth: 0 }}>
        <Chart
          definition={definition}
          renderer={chartRenderer}
          height={140}
          ariaLabel={m.tt_daily_hours_chart_aria()}
        />
      </div>
      {targetDaily > 0 && (
        <div className="text-muted small mt-1">
          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              width: "12px",
              borderTop: "2px dashed var(--bs-success)",
              marginRight: "4px",
              verticalAlign: "middle",
            }}
          />
          {m.tt_target_label()}: {targetDaily.toFixed(1)} {m.tt_hours_unit()}
        </div>
      )}
    </div>
  );
}
