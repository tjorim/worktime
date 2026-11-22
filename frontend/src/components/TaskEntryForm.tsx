import { CircleIcon } from "lucide-react";
import { Icon } from "@/components/Icon";
import { useId, useMemo } from "react";
import { Button } from "@/components/ui/button";

import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { Grid, GridItem } from "@/components/ui/grid";
import type { CSSProperties } from "react";
import { SearchSelect } from "@/components/SearchSelect";
import {
  isHexColor,
  getDefaultLabelColor,
  getContrastingTextColor,
} from "@/lib/time-tracking/constants";
import type { Label } from "@/lib/time-tracking/constants";
import type { GanttTask } from "@/types/gantt";
import { useSelectedLabelOption } from "@/hooks/useSelectedLabelOption";
import { useSelectedGanttTaskOption } from "@/hooks/useSelectedGanttTaskOption";
import * as m from "@/paraglide/messages.js";

type TaskEntryFormProps = {
  labels: Label[];
  text: string;
  onTextChange: (text: string) => void;
  label: string;
  onLabelChange: (label: string) => void;
  ganttTasks?: GanttTask[];
  ganttTaskId?: string;
  onGanttTaskChange?: (ganttTaskId: string) => void;
  showGanttPicker?: boolean;
  start: string;
  onStartChange: (start: string) => void;
  stop: string;
  onStopChange: (stop: string) => void;
  canSubmit: boolean;
  canStartNow: boolean;
  showTimerControls: boolean;
  isTimerRunning: boolean;
  timerElapsed?: string;
  runningTaskSummary?: {
    task: string;
    label: string;
    time: string;
    labelColor: string;
    labelTextColor: string;
    showDetails: boolean;
  };
  startDisabledReason?: string;
  addDisabledReason?: string;
  onSubmit: () => void;
  onStartNow: () => void;
  onStopNow: () => void;
  onCreateLabel?: () => void;
};

export function TaskEntryForm({
  labels,
  text,
  onTextChange,
  label,
  onLabelChange,
  ganttTasks = [],
  ganttTaskId = "",
  onGanttTaskChange = () => undefined,
  showGanttPicker = false,
  start,
  onStartChange,
  stop,
  onStopChange,
  canSubmit,
  canStartNow,
  showTimerControls,
  isTimerRunning,
  timerElapsed,
  runningTaskSummary,
  startDisabledReason,
  addDisabledReason,
  onSubmit,
  onStartNow,
  onStopNow,
  onCreateLabel,
}: TaskEntryFormProps) {
  const selectedLabelOption = useSelectedLabelOption(labels, label);
  const selectedGanttTaskOption = useSelectedGanttTaskOption(ganttTasks, ganttTaskId);
  const ganttTaskOptions = useMemo(
    () => ganttTasks.map((task) => ({ value: task.id, label: task.name })),
    [ganttTasks],
  );
  const primaryFieldWidth = showGanttPicker ? 2 : 3;

  const addReason = !canSubmit ? addDisabledReason : undefined;
  const startReason =
    showTimerControls && !isTimerRunning && !canStartNow ? startDisabledReason : undefined;

  const hasSeparateStartReason = startReason !== undefined && startReason !== addReason;
  const formId = useId();
  const taskHelpId = `${formId}-task-help`;
  const overnightHelpId = `${formId}-overnight-help`;
  const addReasonId = `${formId}-add-reason`;
  const startReasonId = `${formId}-start-reason`;

  return (
    <>
      {showTimerControls && isTimerRunning ? (
        <div className="flex items-center gap-2 mb-4 p-2 rounded-md bg-muted" aria-live="polite">
          {runningTaskSummary && (
            <div className="flex flex-col gap-1 grow min-w-0">
              <div className="flex items-center flex-wrap gap-2">
                <span
                  data-slot="running-status"
                  className="inline-flex rounded-md px-2 py-1 text-xs font-semibold bg-destructive text-primary-foreground inline-flex items-center gap-1"
                >
                  <Icon icon={CircleIcon} fill="currentColor" />
                  {m.tt_running_status()}
                </span>
                <span className="font-semibold truncate">{runningTaskSummary.task}</span>
                <span
                  data-slot="task-label"
                  className="inline-flex items-center rounded-md bg-label px-2 py-0.5 text-xs font-semibold text-label-foreground"
                  style={
                    {
                      "--label-bg": isHexColor(runningTaskSummary.labelColor)
                        ? runningTaskSummary.labelColor
                        : getDefaultLabelColor(),
                      "--label-fg": getContrastingTextColor(
                        isHexColor(runningTaskSummary.labelColor)
                          ? runningTaskSummary.labelColor
                          : getDefaultLabelColor(),
                      ),
                    } as CSSProperties
                  }
                >
                  {runningTaskSummary.label}
                </span>
              </div>
              {runningTaskSummary.showDetails && (
                <span className="text-sm text-muted-foreground">
                  {m.tt_started()} {runningTaskSummary.time}
                </span>
              )}
            </div>
          )}
          <Button size="sm" variant="destructive" className="shrink-0" onClick={onStopNow}>
            {m.tt_stop_timer()} · {timerElapsed}
          </Button>
        </div>
      ) : null}
      <Grid className="gap-4 items-start">
        <GridItem desktopSpan={primaryFieldWidth}>
          <Field>
            <FieldLabel htmlFor="timeTrackerTask">{m.form_task()}</FieldLabel>
            <Input
              id="timeTrackerTask"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              aria-required={!showTimerControls}
              aria-describedby={showTimerControls ? taskHelpId : undefined}
            />
            {showTimerControls && (
              <FieldDescription id={taskHelpId}>
                {m.tt_task_name_hint({ name: m.tt_default_task_name() })}
              </FieldDescription>
            )}
          </Field>
        </GridItem>
        <GridItem desktopSpan={primaryFieldWidth}>
          <Field>
            <FieldLabel htmlFor="timeTrackerLabel">{m.form_label()} *</FieldLabel>
            <SearchSelect
              inputId="timeTrackerLabel"
              required
              disabled={labels.length === 0}
              placeholder={labels.length === 0 ? m.tt_add_labels_first() : m.tt_choose_label()}
              aria-describedby={labels.length === 0 ? "timeTrackerLabelHelp" : undefined}
              options={labels.map((item) => ({ value: item.id, label: item.name }))}
              value={selectedLabelOption}
              onChange={(selected) => onLabelChange(selected?.value ?? "")}
            />
            {labels.length === 0 && (
              <FieldDescription id="timeTrackerLabelHelp" className="block">
                {m.tt_add_labels_first_task_help()}
                {onCreateLabel && (
                  <Button
                    variant="link"
                    size="sm"
                    className="p-0 ms-1 align-baseline"
                    onClick={onCreateLabel}
                  >
                    {m.tt_create_label_action()}
                  </Button>
                )}
              </FieldDescription>
            )}
          </Field>
        </GridItem>
        {showGanttPicker && (
          <GridItem desktopSpan={primaryFieldWidth}>
            <Field>
              <FieldLabel htmlFor="timeTrackerGanttTask">{m.tt_gantt_task()}</FieldLabel>
              <SearchSelect
                inputId="timeTrackerGanttTask"
                placeholder={m.tt_no_gantt_task()}
                options={ganttTaskOptions}
                value={selectedGanttTaskOption}
                onChange={(selected) => onGanttTaskChange(selected?.value ?? "")}
              />
            </Field>
          </GridItem>
        )}
        <GridItem span={6} desktopSpan={2}>
          <Field>
            <FieldLabel htmlFor="timeTrackerStart">{m.form_start()}</FieldLabel>
            <Input
              id="timeTrackerStart"
              type="time"
              value={start}
              onChange={(e) => onStartChange(e.target.value)}
              aria-required="true"
            />
          </Field>
        </GridItem>
        <GridItem span={6} desktopSpan={2}>
          <Field>
            <FieldLabel htmlFor="timeTrackerStop">{m.form_stop()}</FieldLabel>
            <Input
              aria-describedby={overnightHelpId}
              id="timeTrackerStop"
              type="time"
              value={stop}
              onChange={(e) => onStopChange(e.target.value)}
              aria-required="true"
            />
            <FieldDescription id={overnightHelpId}>{m.tt_overnight_hint()}</FieldDescription>
          </Field>
        </GridItem>
        <GridItem desktopSpan={2}>
          <div className="grid gap-2">
            {showTimerControls && !isTimerRunning && (
              <div className="grid gap-1">
                <Button
                  className="w-full"
                  onClick={onStartNow}
                  disabled={!canStartNow}
                  aria-describedby={
                    hasSeparateStartReason ? startReasonId : startReason && addReasonId
                  }
                >
                  {m.tt_start_now()}
                </Button>
                {hasSeparateStartReason && (
                  <p id={startReasonId} className="text-sm text-muted-foreground">
                    {startReason}
                  </p>
                )}
              </div>
            )}
            <div className="grid gap-1">
              <Button
                variant={showTimerControls && !isTimerRunning ? "outline" : "default"}
                className="w-full"
                onClick={onSubmit}
                disabled={!canSubmit}
                aria-describedby={addReason ? addReasonId : undefined}
              >
                {m.tt_add_task()}
              </Button>
              {addReason && (
                <p id={addReasonId} className="text-sm text-muted-foreground">
                  {addReason}
                </p>
              )}
            </div>
          </div>
        </GridItem>
      </Grid>
    </>
  );
}
