import type { Dayjs } from "dayjs";
import { useMemo, useState, type CSSProperties } from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { Badge } from "@/components/ui/badge";
import { TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import * as m from "@/paraglide/messages.js";
import { dayjs } from "@/utils/dateTimeUtils";
import {
  buildLabelColorMap,
  getContrastingTextColor,
  getDefaultLabelColor,
  type Label,
} from "@/lib/timeTracking/constants";
import { percent } from "./cssVars";
import type { StoredTimeTrackingTask } from "@/lib/timeTracking/types";
import {
  BREAK_DURATION_MINUTES,
  effectiveDurationHours,
  calculateBreakPosition,
} from "@/lib/timeTracking/timeUtils";

const DEFAULT_TARGET_HOURS = 8;

type TimelineProgressBarProps = {
  tasks: StoredTimeTrackingTask[];
  labels: Label[];
  targetHours?: number;
  liveTime?: Dayjs;
  /** Whether the selected date is today. Shows the Now line when true. */
  isToday?: boolean;
};

type TaskSegment = {
  type: "task";
  id: string;
  text: string;
  color: string;
  textColor: string;
  /** Effective working hours (break already deducted). */
  durationHours: number;
  percentage: number;
  isPlanned: boolean;
  includesBreak?: boolean;
  /** Hours of work before the break slice. */
  beforeBreakHours?: number;
  /** Hours of the break slice itself. */
  breakHours?: number;
  /** Hours of work after the break slice. */
  afterBreakHours?: number;
};

type GapSegment = {
  type: "gap";
  id: string;
  durationHours: number;
  percentage: number;
  untilNext?: boolean;
};

type RenderSegment = TaskSegment | GapSegment;

const SEGMENT_BASE =
  "tw:flex tw:h-full tw:shrink-0 tw:items-center tw:justify-center tw:overflow-hidden tw:w-(--seg-w)";
const SEGMENT_LABEL = "tw:truncate tw:px-1 tw:text-xs tw:font-semibold";

type SegmentProps = {
  width: number;
  label: string;
  color?: string;
  planned?: boolean;
  dim?: boolean;
  text?: string;
  testId?: string;
  onEnter: (event: React.MouseEvent<HTMLElement>) => void;
  onLeave: () => void;
};

/** One interval of the day bar; geometry and colour are runtime values passed as custom properties. */
function Segment({
  width,
  label,
  color,
  planned,
  dim,
  text,
  testId,
  onEnter,
  onLeave,
}: SegmentProps) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(width)}
      aria-label={label}
      data-testid={testId}
      data-planned={planned ? "true" : undefined}
      className={cn(
        SEGMENT_BASE,
        color ? "tw:bg-label tw:text-label-foreground" : "tw:bg-secondary",
        planned && "tw:progress-stripes",
        dim && "tw:opacity-30",
      )}
      style={
        {
          "--seg-w": percent(width),
          "--label-bg": color,
          "--label-fg": color ? getContrastingTextColor(color) : undefined,
        } as CSSProperties
      }
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {text ? <span className={SEGMENT_LABEL}>{text}</span> : null}
    </div>
  );
}

export function TimelineProgressBar({
  tasks,
  labels,
  targetHours = DEFAULT_TARGET_HOURS,
  liveTime,
  isToday,
}: TimelineProgressBarProps) {
  const sanitizedTargetHours =
    Number.isFinite(targetHours) && targetHours > 0 ? targetHours : DEFAULT_TARGET_HOURS;

  const colorByLabelId = useMemo(() => buildLabelColorMap(labels), [labels]);

  const [tooltipInfo, setTooltipInfo] = useState<{
    label: string;
    target: HTMLElement;
  } | null>(null);

  const showTooltip = (label: string) => (e: React.MouseEvent<HTMLElement>) =>
    setTooltipInfo({ label, target: e.currentTarget });
  const hideTooltip = () => setTooltipInfo(null);

  const renderSegments = useMemo<RenderSegment[]>(() => {
    const result: RenderSegment[] = [];
    const runningTask = tasks.find((task) => !task.stopTime);
    const runningTaskStart = runningTask ? dayjs(runningTask.startTime) : null;

    const firstTask = tasks[0];
    if (isToday && liveTime && firstTask) {
      const gapHours = dayjs(firstTask.startTime).diff(liveTime, "hour", true);
      if (gapHours > 0) {
        result.push({
          type: "gap",
          id: "gap-now-to-first-task",
          durationHours: gapHours,
          percentage: (gapHours / sanitizedTargetHours) * 100,
          untilNext: true,
        });
      }
    }

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task) continue;

      const startDayjs = dayjs(task.startTime);
      const stopDayjs = task.stopTime ? dayjs(task.stopTime) : (liveTime ?? dayjs());
      const rawDurationHours = Math.max(stopDayjs.diff(startDayjs, "hour", true), 0);
      const durationHours = effectiveDurationHours(rawDurationHours, task.includesBreak);
      const color = colorByLabelId[task.label] ?? getDefaultLabelColor();
      const textColor = getContrastingTextColor(color);

      const segment: TaskSegment = {
        type: "task",
        id: task.id,
        text: task.text,
        color,
        textColor,
        durationHours,
        percentage: (durationHours / sanitizedTargetHours) * 100,
        isPlanned: Boolean(
          task.stopTime &&
          liveTime &&
          (startDayjs.isAfter(liveTime) ||
            (runningTaskStart && startDayjs.isAfter(runningTaskStart))),
        ),
        includesBreak: task.includesBreak,
      };

      if (task.includesBreak && rawDurationHours > 0) {
        const taskStartMinutes = startDayjs.hour() * 60 + startDayjs.minute();
        const taskStopMinutes = stopDayjs.hour() * 60 + stopDayjs.minute();
        const pos = calculateBreakPosition(taskStartMinutes, taskStopMinutes);
        segment.beforeBreakHours = pos.beforeHours;
        segment.breakHours = pos.breakHours;
        segment.afterBreakHours = pos.afterHours;
      }

      result.push(segment);

      // Insert a gap segment between this task and the next.
      const next = tasks[i + 1];
      if (task.stopTime && next?.startTime) {
        const gapHours = dayjs(next.startTime).diff(dayjs(task.stopTime), "hour", true);
        if (gapHours > 0) {
          result.push({
            type: "gap",
            id: `gap-${task.id}`,
            durationHours: gapHours,
            percentage: (gapHours / sanitizedTargetHours) * 100,
          });
        }
      } else if (!task.stopTime && liveTime && next?.startTime) {
        const gapHours = dayjs(next.startTime).diff(liveTime, "hour", true);
        if (gapHours > 0) {
          result.push({
            type: "gap",
            id: `gap-until-${next.id}`,
            durationHours: gapHours,
            percentage: (gapHours / sanitizedTargetHours) * 100,
            untilNext: true,
          });
        }
      }
    }

    return result;
  }, [tasks, colorByLabelId, liveTime, isToday, sanitizedTargetHours]);

  const {
    totalHours,
    totalPercentage,
    plannedHours,
    plannedPercentage,
    totalBreakHours,
    totalGapHours,
  } = useMemo(() => {
    let hours = 0;
    let percentage = 0;
    let plannedHours = 0;
    let plannedPercentage = 0;
    let breakHours = 0;
    let gapHours = 0;
    for (const s of renderSegments) {
      if (s.type === "task") {
        if (s.isPlanned) {
          plannedHours += s.durationHours;
          plannedPercentage += s.percentage;
        } else {
          hours += s.durationHours;
          percentage += s.percentage;
        }
        breakHours += s.breakHours ?? 0;
      } else {
        gapHours += s.durationHours;
      }
    }
    return {
      totalHours: hours,
      totalPercentage: percentage,
      plannedHours,
      plannedPercentage,
      totalBreakHours: breakHours,
      totalGapHours: gapHours,
    };
  }, [renderSegments]);

  const visualTotalPercentage =
    totalPercentage +
    plannedPercentage +
    (totalBreakHours / sanitizedTargetHours) * 100 +
    (totalGapHours / sanitizedTargetHours) * 100;
  const normalizationFactor = visualTotalPercentage > 100 ? 100 / visualTotalPercentage : 1;

  const isOvertime = totalPercentage > 100;

  // Now line is positioned at wall-clock elapsed time from the first task's start,
  // so it accounts for gaps between tasks correctly.
  const nowPct = useMemo(() => {
    if (!isToday || !liveTime || tasks.length === 0) return null;
    const firstTask = tasks[0];
    if (!firstTask?.startTime) return null;
    const elapsedHours = liveTime.diff(dayjs(firstTask.startTime), "hour", true);
    const scaledPct = (elapsedHours / sanitizedTargetHours) * 100 * normalizationFactor;
    return Math.max(0, Math.min(scaledPct, 100));
  }, [isToday, liveTime, tasks, sanitizedTargetHours, normalizationFactor]);

  return (
    <div className="tw:my-3">
      <div className="tw:relative">
        <div className="tw:flex tw:h-4 tw:w-full tw:overflow-hidden tw:rounded-full tw:bg-muted">
          {renderSegments.map((rs) => {
            if (rs.type === "gap") {
              const minutes = Math.round(rs.durationHours * 60);
              const gapLabel = rs.untilNext
                ? m.tt_until_next_aria({ minutes })
                : m.tt_gap_aria({ minutes });
              return (
                <Segment
                  key={rs.id}
                  width={rs.percentage * normalizationFactor}
                  label={gapLabel}
                  onEnter={showTooltip(gapLabel)}
                  onLeave={hideTooltip}
                />
              );
            }

            const tooltipText = `${rs.text}: ${rs.durationHours.toFixed(2)}h`;

            if (
              rs.includesBreak &&
              rs.breakHours != null &&
              rs.beforeBreakHours != null &&
              rs.afterBreakHours != null
            ) {
              const beforePct =
                (rs.beforeBreakHours / sanitizedTargetHours) * 100 * normalizationFactor;
              const breakPct = (rs.breakHours / sanitizedTargetHours) * 100 * normalizationFactor;
              const afterPct =
                (rs.afterBreakHours / sanitizedTargetHours) * 100 * normalizationFactor;
              const breakTooltipText = m.tt_break_deducted({ minutes: BREAK_DURATION_MINUTES });

              const showLabelOnBefore = beforePct >= afterPct;
              const labelOnBefore = showLabelOnBefore && beforePct > 10;
              const labelOnAfter = !showLabelOnBefore && afterPct > 10;

              const parts: React.ReactNode[] = [];

              if (beforePct > 0) {
                parts.push(
                  <Segment
                    key={rs.id}
                    width={beforePct}
                    color={rs.color}
                    planned={rs.isPlanned}
                    label={tooltipText}
                    text={labelOnBefore ? rs.text : undefined}
                    onEnter={showTooltip(tooltipText)}
                    onLeave={hideTooltip}
                  />,
                );
              }

              parts.push(
                <Segment
                  key={`${rs.id}-break`}
                  width={breakPct}
                  color={rs.color}
                  planned={rs.isPlanned}
                  dim
                  label={`Break deduction: ${BREAK_DURATION_MINUTES} minutes`}
                  testId={`break-segment-${rs.id}`}
                  onEnter={showTooltip(breakTooltipText)}
                  onLeave={hideTooltip}
                />,
              );

              if (afterPct > 0) {
                parts.push(
                  <Segment
                    key={`${rs.id}-after`}
                    width={afterPct}
                    color={rs.color}
                    planned={rs.isPlanned}
                    label={tooltipText}
                    text={labelOnAfter ? rs.text : undefined}
                    onEnter={showTooltip(tooltipText)}
                    onLeave={hideTooltip}
                  />,
                );
              }

              return parts;
            }

            const normalizedPercent = rs.percentage * normalizationFactor;
            return (
              <Segment
                key={rs.id}
                width={normalizedPercent}
                color={rs.color}
                planned={rs.isPlanned}
                label={tooltipText}
                text={normalizedPercent > 10 ? rs.text : undefined}
                onEnter={showTooltip(tooltipText)}
                onLeave={hideTooltip}
              />
            );
          })}
        </div>

        <TooltipPrimitive.Root open={tooltipInfo !== null}>
          <TooltipContent anchor={tooltipInfo?.target ?? null}>{tooltipInfo?.label}</TooltipContent>
        </TooltipPrimitive.Root>

        {nowPct !== null && liveTime && (
          <div
            className="tw:pointer-events-none tw:absolute tw:top-0 tw:bottom-0 tw:left-(--now-pos) tw:w-0.5 tw:-translate-x-1/2 tw:bg-destructive"
            style={{ "--now-pos": percent(nowPct) } as CSSProperties}
            data-testid="now-line"
            aria-label={`Current time: ${liveTime.format("HH:mm")}`}
          />
        )}
      </div>

      <div className="tw:mt-2 tw:flex tw:items-center tw:justify-between tw:text-muted-foreground">
        <span data-testid="timeline-total-duration">
          {totalHours.toFixed(2)}h ({totalPercentage.toFixed(1)}%)
        </span>
        {plannedHours > 0 && (
          <span className="tw:text-sm" data-testid="timeline-planned-duration">
            {m.tt_planned_total({ hours: plannedHours.toFixed(2) })}
          </span>
        )}
        {isOvertime && (
          <Badge variant="warning">
            Overtime: +{(totalHours - sanitizedTargetHours).toFixed(2)}h
          </Badge>
        )}
      </div>
    </div>
  );
}
