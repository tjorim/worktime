import { useMemo } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import ReactSelect from "react-select";
import { dayjs } from "@/utils/dateTimeUtils";
import type { Label } from "@/lib/timeTracking/constants";
import { BREAK_DURATION_MINUTES } from "@/lib/timeTracking/timeUtils";
import { selectClassNames } from "@/utils/reactSelectStyles";
import { useSelectedLabelOption, type LabelOption } from "@/hooks/useSelectedLabelOption";
import {
  useSelectedGanttTaskOption,
  type GanttTaskOption,
} from "@/hooks/useSelectedGanttTaskOption";
import * as m from "@/paraglide/messages.js";
import type { GanttTask } from "@/types/gantt";

export type TaskEditForm = {
  text: string;
  label: string;
  start: string;
  stop: string;
  includesBreak: boolean;
  ganttTaskId?: string;
};

type TaskEditModalProps = {
  show: boolean;
  labels: Label[];
  ganttTasks?: GanttTask[];
  showGanttPicker?: boolean;
  value: TaskEditForm;
  onChange: (value: TaskEditForm) => void;
  onClose: () => void;
  onSubmit: () => void;
  canSubmit?: boolean;
  error: string;
  info?: string;
};

export function TaskEditModal({
  show,
  labels,
  ganttTasks = [],
  showGanttPicker = false,
  value,
  onChange,
  onClose,
  onSubmit,
  canSubmit = true,
  error,
  info,
}: TaskEditModalProps) {
  const isTooShortForBreak = useMemo(() => {
    if (!value.stop || !value.start) return false;
    const start = dayjs(`2000-01-01T${value.start}`);
    let stop = dayjs(`2000-01-01T${value.stop}`);
    // If stop is less than or equal to start, treat stop as next day
    if (stop.isSameOrBefore(start)) {
      stop = stop.add(1, "day");
    }
    return stop.diff(start, "minute") < BREAK_DURATION_MINUTES;
  }, [value.start, value.stop]);

  const selectedLabelOption = useSelectedLabelOption(labels, value.label);
  const selectedGanttTaskOption = useSelectedGanttTaskOption(ganttTasks, value.ganttTaskId);
  const ganttTaskOptions = useMemo(
    () => ganttTasks.map((task) => ({ value: task.id, label: task.name })),
    [ganttTasks],
  );

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.tt_edit_task_title()}</DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          {error && (
            <Alert variant="destructive" aria-live="polite">
              {error}
            </Alert>
          )}
          {info && (
            <Alert variant="info" aria-live="polite">
              {info}
            </Alert>
          )}
          <form
            id="taskEditForm"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <Field className="tw:mb-4">
              <FieldLabel htmlFor="editTaskName">{m.form_task()}</FieldLabel>
              <Input
                id="editTaskName"
                value={value.text}
                onChange={(event) => onChange({ ...value, text: event.target.value })}
              />
            </Field>
            <Field className="tw:mb-4">
              <FieldLabel htmlFor="editTaskLabel">{m.form_label()}</FieldLabel>
              <ReactSelect<LabelOption>
                unstyled
                isClearable
                isSearchable
                inputId="editTaskLabel"
                placeholder={m.tt_select_label()}
                options={labels.map((l) => ({ value: l.id, label: l.name }))}
                value={selectedLabelOption}
                onChange={(selected) => onChange({ ...value, label: selected?.value ?? "" })}
                classNames={selectClassNames}
              />
            </Field>
            {showGanttPicker && (
              <Field className="tw:mb-4">
                <FieldLabel htmlFor="editTaskGanttTask">{m.tt_gantt_task()}</FieldLabel>
                <ReactSelect<GanttTaskOption>
                  unstyled
                  isClearable
                  isSearchable
                  inputId="editTaskGanttTask"
                  placeholder={m.tt_no_gantt_task()}
                  options={ganttTaskOptions}
                  value={selectedGanttTaskOption}
                  onChange={(selected) => onChange({ ...value, ganttTaskId: selected?.value })}
                  classNames={selectClassNames}
                />
              </Field>
            )}
            <div className="tw:flex tw:gap-4 tw:mb-4">
              <Field className="tw:flex-1">
                <FieldLabel htmlFor="editTaskStart">{m.form_start()}</FieldLabel>
                <Input
                  id="editTaskStart"
                  type="time"
                  value={value.start}
                  onChange={(event) => onChange({ ...value, start: event.target.value })}
                />
              </Field>
              <Field className="tw:flex-1">
                <FieldLabel htmlFor="editTaskStop">{m.form_stop()}</FieldLabel>
                <Input
                  id="editTaskStop"
                  type="time"
                  value={value.stop}
                  onChange={(event) => onChange({ ...value, stop: event.target.value })}
                />
                <FieldDescription className="tw:text-muted-foreground">
                  {m.tt_stop_empty_hint()}
                </FieldDescription>
              </Field>
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id="editTaskBreak"
                checked={value.includesBreak}
                onCheckedChange={(checked) => onChange({ ...value, includesBreak: checked })}
                disabled={!value.includesBreak && isTooShortForBreak}
              />
              <FieldLabel htmlFor="editTaskBreak">
                {m.tt_includes_break({ minutes: BREAK_DURATION_MINUTES })}
              </FieldLabel>
            </Field>
            {isTooShortForBreak && !value.includesBreak && (
              <FieldDescription className="tw:text-danger-text" data-testid="break-too-short-help">
                {m.tt_task_too_short_break()}
              </FieldDescription>
            )}
          </form>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {m.cancel()}
          </Button>
          <Button variant="default" type="submit" form="taskEditForm" disabled={!canSubmit}>
            {m.tt_save_changes()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
