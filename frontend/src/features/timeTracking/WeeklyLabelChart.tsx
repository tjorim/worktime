import { ChartColumnStacked as ChartColumnStackedIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Icon } from "@/components/shared/Icon";
import { barY, defineChart, ruleY, stack } from "@tanstack/charts";
import { controlledSignal } from "@tanstack/charts/interaction/signal";
import { interactiveColorLegend } from "@tanstack/charts/legend";
import { motion } from "@tanstack/charts/motion";
import { Chart } from "@tanstack/charts/react/core";
import { scaleBand } from "@tanstack/charts/scales/band";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { tooltip } from "@tanstack/charts/tooltip";
import * as m from "@/paraglide/messages.js";
import { resolveLabelColors } from "./cssVars";
import type { LabelPercentage, WeekDay, WeeklySummary } from "./hooks/useWeeklyTimeTrackingSummary";

interface LabelHoursRow {
  day: string;
  label: string;
  hours: number;
}

const chartRenderer = motion({
  transition: { type: "spring", stiffness: 170, damping: 22, mass: 1 },
});

interface WeeklyLabelChartProps {
  weekDays: WeekDay[];
  dailyTotals: Record<string, WeeklySummary>;
  /** Ordered by hours, descending; the order is also the stacking and legend order. */
  labelPercentages: LabelPercentage[];
  targetDaily: number;
}

/** Daily hours stacked by category, with a legend that shows, hides and highlights categories. */
export function WeeklyLabelChart({
  weekDays,
  dailyTotals,
  labelPercentages,
  targetDaily,
}: WeeklyLabelChartProps) {
  // Hidden (not visible) categories are stored so a category that appears later defaults to shown.
  const [hiddenLabels, setHiddenLabels] = useState<readonly string[]>([]);

  const definition = useMemo(() => {
    const domain = labelPercentages.map((item) => item.label);
    const visible: readonly string[] = domain.filter((label) => !hiddenLabels.includes(label));
    const days = weekDays.map((day) => day.label.substring(0, 3));
    // The x domain follows the rows, so an empty day gets a zero-hour row to keep all seven days.
    const rows: LabelHoursRow[] = weekDays.flatMap((day) => {
      const dayRows = domain.flatMap((label) => {
        const hours = dailyTotals[day.iso]?.[label] ?? 0;
        return hours > 0 ? [{ day: day.label.substring(0, 3), label, hours }] : [];
      });
      return dayRows.length > 0
        ? dayRows
        : [{ day: day.label.substring(0, 3), label: domain[0] ?? "", hours: 0 }];
    });

    return defineChart({
      marks: [
        ...(targetDaily > 0
          ? [
              ruleY([targetDaily], {
                stroke: "var(--wt-success)",
                strokeOpacity: 0.7,
                strokeDasharray: "4 3",
              }),
            ]
          : []),
        barY(rows, {
          x: "day",
          y: "hours",
          color: "label",
          layout: stack({ order: domain }),
          radius: 2,
          // Hovering or focusing a legend item dims the other categories.
          states: [{ when: { focus: "unmatched", source: "legend" }, style: { opacity: 0.25 } }],
        }),
      ],
      scales: {
        x: { scale: () => scaleBand<string>().domain(days).padding(0.35) },
        y: { scale: scaleLinear, nice: true, grid: true },
      },
      color: {
        domain,
        range: labelPercentages.map((item) => resolveLabelColors(item.color).background),
        legend: interactiveColorLegend({
          visible: controlledSignal(visible, (next) =>
            setHiddenLabels(domain.filter((label) => !next.includes(label))),
          ),
          hover: "series",
          placement: "bottom",
          ariaLabel: m.tt_label_chart_legend_aria(),
        }),
      },
      tooltip,
    });
  }, [weekDays, dailyTotals, labelPercentages, targetDaily, hiddenLabels]);

  return (
    <div className="mb-4">
      <h6 className="mb-3 text-base font-medium text-muted-foreground uppercase">
        <Icon icon={ChartColumnStackedIcon} className="mr-2" />
        {m.tt_label_chart_heading()}
      </h6>
      <div className="min-w-0">
        <Chart
          definition={definition}
          renderer={chartRenderer}
          height={200}
          ariaLabel={m.tt_label_chart_aria()}
          ariaDescription={m.tt_label_chart_desc()}
        />
      </div>
    </div>
  );
}
