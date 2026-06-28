import type { Dayjs } from "dayjs";
import { useMemo } from "react";
import { dayjs } from "@/utils/dateTimeUtils";
import { buildLabelNameMap, type TimeTrackingLabel } from "@/components/timeTracking/constants";
import { effectiveDurationHours } from "@/components/timeTracking/timeUtils";
import type { StoredTimeTrackingTask } from "@/components/timeTracking/types";

export type WeeklyOverviewRow = {
  label: string;
  date: string;
  hours: number;
};

export type WeeklySummary = Record<string, number>;

export type WeekDay = {
  iso: string;
  label: string;
};

export type LabelPercentage = {
  label: string;
  hours: number;
  percentage: number;
  color: string;
};

export function getWeekDateRange(year: number, week: number): [string, string] {
  const start = dayjs(`${year}-01-04`).isoWeek(week).startOf("isoWeek");
  const end = start.endOf("isoWeek");
  return [start.format("YYYY-MM-DD"), end.format("YYYY-MM-DD")];
}

function buildWeekDays(startIso: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, idx) => {
    const date = dayjs(startIso).add(idx, "day");
    return {
      iso: date.format("YYYY-MM-DD"),
      label: date.format("dddd"),
    };
  });
}

interface UseWeeklyTimeTrackingSummaryParams {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  liveTime: Dayjs;
  start: string;
  end: string;
  defaultLabelColor: string;
}

export function useWeeklyTimeTrackingSummary({
  tasks,
  labels,
  liveTime,
  start,
  end,
  defaultLabelColor,
}: UseWeeklyTimeTrackingSummaryParams) {
  const labelNameById = useMemo(() => buildLabelNameMap(labels), [labels]);
  const labelNameToColor = useMemo(() => {
    const map: Record<string, string> = {};
    labels.forEach((label) => {
      map[label.name] = label.color;
    });
    return map;
  }, [labels]);

  const rows = useMemo<WeeklyOverviewRow[]>(
    () =>
      tasks
        .filter((task) => {
          const taskDate = task.startTime.substring(0, 10);
          return taskDate >= start && taskDate <= end;
        })
        .map((task) => {
          const startDayjs = dayjs(task.startTime);
          const stopDayjs = task.stopTime ? dayjs(task.stopTime) : liveTime;
          const rawHours = Math.max(stopDayjs.diff(startDayjs, "hour", true), 0);
          const labelName = labelNameById[task.label] ?? "Unknown label";
          return {
            date: task.startTime.substring(0, 10),
            label: labelName,
            hours: effectiveDurationHours(rawHours, task.includesBreak),
          };
        }),
    [tasks, start, end, labelNameById, liveTime],
  );

  const { summary, dailyTotals, labelNames, weekTotal, weekDays } = useMemo(() => {
    const totals = rows.reduce<WeeklySummary>((acc, row) => {
      acc[row.label] = (acc[row.label] ?? 0) + row.hours;
      return acc;
    }, {});
    const days = buildWeekDays(start);
    const dayTotals = days.reduce<Record<string, WeeklySummary>>((acc, day) => {
      acc[day.iso] = {};
      return acc;
    }, {});

    rows.forEach((row) => {
      const bucket = dayTotals[row.date] ?? {};
      bucket[row.label] = (bucket[row.label] ?? 0) + row.hours;
      dayTotals[row.date] = bucket;
    });

    const labelList = Object.keys(totals).sort();
    const weekSum = labelList.reduce((sum, label) => sum + (totals[label] ?? 0), 0);

    return {
      summary: totals,
      dailyTotals: dayTotals,
      labelNames: labelList,
      weekTotal: weekSum,
      weekDays: days,
    };
  }, [rows, start]);

  const dailyHourTotals = useMemo(
    () =>
      weekDays.map((day) => {
        const daySummary = dailyTotals[day.iso] ?? {};
        return labelNames.reduce((sum, label) => sum + (daySummary[label] ?? 0), 0);
      }),
    [weekDays, dailyTotals, labelNames],
  );

  const avgDailyHours = useMemo(() => {
    const daysWithData = dailyHourTotals.filter((total) => total > 0).length;
    return daysWithData > 0 ? weekTotal / daysWithData : 0;
  }, [dailyHourTotals, weekTotal]);

  const labelPercentages = useMemo<LabelPercentage[]>(() => {
    if (weekTotal === 0) return [];
    return Object.entries(summary)
      .map(([label, hours]) => ({
        label,
        hours,
        percentage: (hours / weekTotal) * 100,
        color: labelNameToColor[label] ?? defaultLabelColor,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [summary, weekTotal, labelNameToColor, defaultLabelColor]);

  return {
    rows,
    summary,
    dailyTotals,
    labelNames,
    weekTotal,
    weekDays,
    dailyHourTotals,
    avgDailyHours,
    labelPercentages,
  };
}
