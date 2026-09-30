import { Circle as CircleIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { Hint } from "@/components/ui/tooltip";
import { Grid, GridItem } from "@/components/ui/grid";
import type { CSSProperties, ReactElement } from "react";
import ReactSelect from "react-select";
import {
  isHexColor,
  getDefaultLabelColor,
  getContrastingTextColor,
} from "@/lib/timeTracking/constants";
import type { Label } from "@/lib/timeTracking/constants";
import type { GanttTask } from "@/types/gantt";
import { selectClassNames } from "@/utils/reactSelectStyles";
import { useSelectedLabelOption, type LabelOption } from "@/hooks/useSelectedLabelOption";
import {
  useSelectedGanttTaskOption,
  type GanttTaskOption,
} from "@/hooks/useSelectedGanttTaskOption";
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

  const renderDisabledTooltipButton = (
    buttonKey: string,
    reason: string | undefined,
    button: ReactElement,
  ) => {
    if (!reason) {
      return button;
    }

    const tooltipId = `${buttonKey}-tooltip`;
    return (
      <Hint content={<div id={tooltipId}>{reason}</div>}>
        <span className="tw:w-full tw:inline-block" tabIndex={0} aria-describedby={tooltipId}>
          {button}
        </span>
      </Hint>
    );
  };

  return (
    <>
      {showTimerControls && isTimerRunning ? (
        <div
          className="tw:flex tw:items-center tw:gap-2 tw:mb-4 tw:p-2 tw:rounded-md tw:bg-muted"
          aria-live="polite"
        >
          {runningTaskSummary && (
            <div className="tw:flex tw:flex-col tw:gap-1 tw:grow tw:min-w-0">
              <div className="tw:flex tw:items-center tw:flex-wrap tw:gap-2">
                <span
                  data-slot="running-status"
                  className="tw:inline-flex tw:rounded-md tw:px-2 tw:py-1 tw:text-xs tw:font-semibold tw:bg-destructive tw:text-primary-foreground tw:inline-flex tw:items-center tw:gap-1"
                >
                  <Icon icon={CircleIcon} fill="currentColor" />
                  {m.tt_running_status()}
                </span>
                <span className="tw:font-semibold tw:truncate">{runningTaskSummary.task}</span>
                <span
                  data-slot="task-label"
                  className="tw:inline-flex tw:items-center tw:rounded-md tw:bg-label tw:px-2 tw:py-0.5 tw:text-xs tw:font-semibold tw:text-label-foreground"
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
                <span className="tw:text-sm tw:text-muted-foreground">
                  {m.tt_started()} {runningTaskSummary.time}
                </span>
              )}
            </div>
          )}
          <Button size="sm" variant="destructive" className="tw:shrink-0" onClick={onStopNow}>
            {m.tt_stop_timer()} · {timerElapsed}
          </Button>
        </div>
      ) : showTimerControls ? (
        <p className="tw:text-sm tw:text-muted-foreground tw:mb-2">{m.tt_quick_timer_desc()}</p>
      ) : null}
      <Grid className="tw:gap-4 tw:items-end">
        <GridItem desktopSpan={primaryFieldWidth}>
          <Field>
            <FieldLabel htmlFor="timeTrackerTask">{m.form_task()}</FieldLabel>
            <Input
              id="timeTrackerTask"
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              aria-required="true"
            />
          </Field>
        </GridItem>
        <GridItem desktopSpan={primaryFieldWidth}>
          <Field>
            <FieldLabel htmlFor="timeTrackerLabel">{m.form_label()}</FieldLabel>
            <ReactSelect<LabelOption>
              unstyled
              isClearable
              isSearchable
              inputId="timeTrackerLabel"
              isDisabled={labels.length === 0}
              placeholder={labels.length === 0 ? m.tt_add_labels_first() : m.tt_choose_label()}
              aria-describedby={labels.length === 0 ? "timeTrackerLabelHelp" : undefined}
              options={labels.map((item) => ({ value: item.id, label: item.name }))}
              value={selectedLabelOption}
              onChange={(selected) => onLabelChange(selected?.value ?? "")}
              classNames={selectClassNames}
            />
            {labels.length === 0 && (
              <FieldDescription id="timeTrackerLabelHelp" className="tw:block">
                {m.tt_add_labels_first_task_help()}
                {onCreateLabel && (
                  <Button
                    variant="link"
                    size="sm"
                    className="tw:p-0 tw:ms-1 tw:align-baseline"
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
              <ReactSelect<GanttTaskOption>
                unstyled
                isClearable
                isSearchable
                inputId="timeTrackerGanttTask"
                placeholder={m.tt_no_gantt_task()}
                options={ganttTaskOptions}
                value={selectedGanttTaskOption}
                onChange={(selected) => onGanttTaskChange(selected?.value ?? "")}
                classNames={selectClassNames}
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
              id="timeTrackerStop"
              type="time"
              value={stop}
              onChange={(e) => onStopChange(e.target.value)}
              aria-required="true"
            />
          </Field>
        </GridItem>
        <GridItem desktopSpan={2}>
          <div className="tw:grid tw:gap-2">
            {showTimerControls &&
              !isTimerRunning &&
              renderDisabledTooltipButton(
                "start-now",
                !canStartNow ? startDisabledReason : undefined,
                <Button
                  variant="default"
                  className="tw:w-full"
                  onClick={onStartNow}
                  disabled={!canStartNow}
                >
                  {m.tt_start_now()}
                  <> · {m.tt_idle_status()}</>
                </Button>,
              )}
            {renderDisabledTooltipButton(
              "add-task",
              !canSubmit ? addDisabledReason : undefined,
              <Button className="tw:w-full" onClick={onSubmit} disabled={!canSubmit}>
                {m.tt_add_task()}
              </Button>,
            )}
          </div>
        </GridItem>
      </Grid>
    </>
  );
}
