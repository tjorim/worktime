import { CircleX as CircleXIcon, Pencil as PencilIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogSelect } from "@/components/shared/DialogSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useForm, useSelector } from "@tanstack/react-form";
import { dayjs } from "@/utils/dateTimeUtils";
import type { GanttTask, RawGanttTask } from "@/types/gantt";
import { selectClassNames } from "@/utils/reactSelectStyles";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { useSelectedLabelOption, type LabelOption } from "@/hooks/useSelectedLabelOption";
import { getLoggedMinutes, formatLoggedDuration } from "@/utils/ganttLoggedTime";
import * as m from "@/paraglide/messages.js";

type DepOption = { value: string; label: string };

export type GanttTaskFormInput = Omit<RawGanttTask, "id">;

interface GanttTaskModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (task: GanttTaskFormInput) => void;
  task?: GanttTask;
  existingTasks: Array<Pick<GanttTask, "id" | "name">>;
  onDelete?: () => void;
  /** Navigate to Time Tracking with the given logged entry pre-selected for editing. */
  onNavigateToEntry?: (entryId: string) => void;
}

const DATE_FORMAT = "YYYY-MM-DD";

type FormState = Omit<GanttTaskFormInput, "dependencies">;

function createInitialValue(task?: GanttTask): FormState {
  if (task) {
    return {
      name: task.name,
      label: task.label,
      start: task.start,
      end: task.end,
      progress: task.progress,
      notes: task.notes,
    };
  }

  const today = dayjs().format(DATE_FORMAT);
  return {
    name: "",
    label: "",
    start: today,
    end: today,
    progress: 0,
    notes: "",
  };
}

function parseDeps(dependencies?: unknown): string[] {
  if (typeof dependencies === "string") {
    return dependencies
      .split(",")
      .map((d) => d.trim())
      .filter(Boolean);
  }

  if (Array.isArray(dependencies)) {
    return dependencies
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

export function GanttTaskModal({
  show,
  onHide,
  onSave,
  task,
  existingTasks,
  onDelete,
  onNavigateToEntry,
}: GanttTaskModalProps) {
  const [selectedDeps, setSelectedDeps] = useState<string[]>(() => parseDeps(task?.dependencies));
  const [wasValidated, setWasValidated] = useState(false);
  const {
    tasks: timeTrackingTasks,
    labels: timeTrackingLabels,
    updateTaskTimes,
  } = useTimeTrackingStorage();

  const form = useForm({
    defaultValues: createInitialValue(task),
    onSubmit: ({ value }) => {
      onSave({
        ...value,
        name: value.name.trim(),
        // Always send an explicit string (never undefined) so a cleared label
        // reliably overwrites an existing one — updateTask only applies a
        // field when it is present, and this form always submits full state.
        label: value.label ?? "",
        dependencies: selectedDeps.length > 0 ? selectedDeps.join(", ") : undefined,
        notes: value.notes?.trim() || undefined,
        progress: value.progress ?? 0,
      });
    },
  });

  // Reset form state whenever the modal opens/closes or the task changes, as
  // a same-render response rather than a follow-up effect.
  const [prevShow, setPrevShow] = useState(show);
  const [prevTask, setPrevTask] = useState(task);
  if (prevShow !== show || prevTask !== task) {
    setPrevShow(show);
    setPrevTask(task);
    form.reset(createInitialValue(task));
    setSelectedDeps(parseDeps(task?.dependencies));
    if (!show) {
      setWasValidated(false);
    }
  }

  const modalTitle = task ? m.gantt_task_modal_edit() : m.gantt_task_modal_add();
  const submitLabel = task ? m.tt_save_changes() : m.gantt_task_modal_add();

  const isLabelSelectionDisabled = timeTrackingLabels.length === 0;
  const labelOptions = useMemo(
    () => timeTrackingLabels.map((l) => ({ value: l.id, label: l.name })),
    [timeTrackingLabels],
  );
  const labelValue = useSelector(form.atom, (state) => state.values.label);
  const selectedLabelOption = useSelectedLabelOption(timeTrackingLabels, labelValue);

  // Options: all tasks except self
  const depOptions = useMemo(
    () =>
      existingTasks.filter((t) => t.id !== task?.id).map((t) => ({ value: t.id, label: t.name })),
    [existingTasks, task?.id],
  );

  // Current value: selected IDs mapped to option objects (orphaned IDs get a truncated label)
  const depValue = useMemo(
    () =>
      selectedDeps.map((id) => ({
        value: id,
        label:
          depOptions.find((o) => o.value === id)?.label ??
          m.gantt_task_unknown_dependency({ id: id.slice(0, 8) }),
      })),
    [selectedDeps, depOptions],
  );

  const loggedEntries = useMemo(
    () =>
      task
        ? timeTrackingTasks
            .filter((entry) => entry.ganttTaskId === task.id)
            .map((entry) => ({
              ...entry,
              loggedMinutes: getLoggedMinutes(entry.startTime, entry.stopTime, entry.includesBreak),
            }))
            .sort((a, b) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf())
        : [],
    [task, timeTrackingTasks],
  );
  const timeTrackingLabelNames = useMemo(
    () => new Map(timeTrackingLabels.map((label) => [label.id, label.name])),
    [timeTrackingLabels],
  );
  const totalLoggedMinutes = useMemo(
    () => loggedEntries.reduce((total, entry) => total + entry.loggedMinutes, 0),
    [loggedEntries],
  );

  const handleEditEntry = (entryId: string) => {
    onNavigateToEntry?.(entryId);
    onHide();
  };

  const handleUnlinkEntry = (entry: {
    id: string;
    startTime: string;
    stopTime?: string | null;
  }) => {
    updateTaskTimes({
      id: entry.id,
      newStartTime: entry.startTime,
      newStopTime: entry.stopTime,
      ganttTaskId: "",
    });
  };

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{modalTitle}</DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          <form
            id="ganttTaskForm"
            noValidate
            className="tw:flex tw:flex-col tw:gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setWasValidated(true);
              void form.handleSubmit();
            }}
          >
            <form.Field
              name="name"
              validators={[
                {
                  run: ({ value }) => (value.trim().length > 0 ? undefined : "required"),
                  triggers: ["change"],
                },
              ]}
            >
              {(field) => {
                const invalid = wasValidated && field.errors.length > 0;
                return (
                  <Field data-invalid={invalid}>
                    <FieldLabel htmlFor="ganttTaskName">{m.gantt_task_name_label()}</FieldLabel>
                    <Input
                      id="ganttTaskName"
                      type="text"
                      required
                      value={field.value}
                      aria-invalid={invalid}
                      aria-describedby={invalid ? "ganttTaskName-error" : undefined}
                      onChange={(event) => field.handleChange(event.target.value)}
                    />
                    {invalid && (
                      <FieldError id="ganttTaskName-error">
                        {m.gantt_task_name_required()}
                      </FieldError>
                    )}
                  </Field>
                );
              }}
            </form.Field>

            <form.Field name="label">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="ganttTaskLabel">{m.form_label()}</FieldLabel>
                  <DialogSelect<LabelOption>
                    unstyled
                    isClearable
                    isSearchable
                    inputId="ganttTaskLabel"
                    isDisabled={isLabelSelectionDisabled}
                    placeholder={
                      isLabelSelectionDisabled ? m.tt_add_labels_first() : m.tt_select_label()
                    }
                    aria-describedby={isLabelSelectionDisabled ? "ganttTaskLabelHelp" : undefined}
                    options={labelOptions}
                    value={selectedLabelOption}
                    onChange={(selected) => field.handleChange(selected?.value ?? "")}
                    classNames={selectClassNames}
                  />
                  {isLabelSelectionDisabled ? (
                    <FieldDescription id="ganttTaskLabelHelp">
                      {m.tt_add_labels_first_help()}
                    </FieldDescription>
                  ) : null}
                </Field>
              )}
            </form.Field>

            <div className="tw:flex tw:gap-3">
              <form.Field
                name="start"
                validators={[
                  {
                    run: ({ value }) =>
                      dayjs(value, DATE_FORMAT, true).isValid() ? undefined : "invalid",
                    triggers: ["change"],
                  },
                ]}
              >
                {(field) => {
                  const invalid = wasValidated && field.errors.length > 0;
                  return (
                    <Field className="tw:min-w-0 tw:flex-1" data-invalid={invalid}>
                      <FieldLabel htmlFor="ganttTaskStart">{m.gantt_task_start_label()}</FieldLabel>
                      <Input
                        id="ganttTaskStart"
                        type="date"
                        required
                        value={field.value}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? "ganttTaskStart-error" : undefined}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      {invalid && (
                        <FieldError id="ganttTaskStart-error">
                          {m.gantt_task_start_invalid()}
                        </FieldError>
                      )}
                    </Field>
                  );
                }}
              </form.Field>
              <form.Field
                name="end"
                validators={[
                  {
                    run: ({ value, formApi }) => {
                      const start = formApi.state.values.start;
                      const endDate = dayjs(value, DATE_FORMAT, true);
                      const valid =
                        endDate.isValid() && !endDate.isBefore(dayjs(start, DATE_FORMAT, true));
                      return valid ? undefined : "invalid";
                    },
                    triggers: ["change"],
                    watchFields: ["start"],
                  },
                ]}
              >
                {(field) => {
                  const invalid = wasValidated && field.errors.length > 0;
                  return (
                    <Field className="tw:min-w-0 tw:flex-1" data-invalid={invalid}>
                      <FieldLabel htmlFor="ganttTaskEnd">{m.gantt_task_end_label()}</FieldLabel>
                      <Input
                        id="ganttTaskEnd"
                        type="date"
                        required
                        value={field.value}
                        aria-invalid={invalid}
                        aria-describedby={invalid ? "ganttTaskEnd-error" : undefined}
                        onChange={(event) => field.handleChange(event.target.value)}
                      />
                      {invalid && (
                        <FieldError id="ganttTaskEnd-error">
                          {m.gantt_task_end_invalid()}
                        </FieldError>
                      )}
                    </Field>
                  );
                }}
              </form.Field>
            </div>

            <form.Field name="progress">
              {(field) => (
                <Field>
                  <FieldLabel
                    htmlFor="ganttTaskProgress"
                    className="tw:flex tw:items-center tw:justify-between"
                  >
                    <span>{m.gantt_task_progress_label()}</span>
                    <span className="tw:text-sm tw:text-muted-foreground">{field.value ?? 0}%</span>
                  </FieldLabel>
                  <input
                    id="ganttTaskProgress"
                    type="range"
                    min={0}
                    max={100}
                    className="tw:w-full tw:accent-primary"
                    value={field.value ?? 0}
                    onChange={(event) => field.handleChange(Number(event.target.value))}
                  />
                </Field>
              )}
            </form.Field>

            <Field>
              <FieldLabel htmlFor="ganttTaskDependencies">{m.gantt_task_deps_label()}</FieldLabel>
              <DialogSelect<DepOption, true>
                isMulti
                unstyled
                inputId="ganttTaskDependencies"
                placeholder={m.gantt_task_deps_placeholder()}
                options={depOptions}
                value={depValue}
                onChange={(selected) => setSelectedDeps(selected.map((s) => s.value))}
                classNames={{
                  ...selectClassNames,
                  control: (state) => `${selectClassNames.control(state)} tw:gap-1`,
                }}
              />
            </Field>

            <form.Field name="notes">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="ganttTaskNotes">{m.gantt_task_notes_label()}</FieldLabel>
                  <Textarea
                    id="ganttTaskNotes"
                    rows={3}
                    value={field.value ?? ""}
                    onChange={(event) => field.handleChange(event.target.value)}
                  />
                </Field>
              )}
            </form.Field>
          </form>
          {task && (
            <section
              className="tw:mt-4 tw:border-t tw:border-border tw:pt-4"
              aria-labelledby="ganttLoggedTimeHeading"
            >
              <div className="tw:mb-2 tw:flex tw:items-center tw:justify-between tw:gap-2">
                <h3 id="ganttLoggedTimeHeading" className="tw:m-0 tw:text-base tw:font-medium">
                  {m.gantt_logged_time_heading()}
                </h3>
                <span className="tw:text-sm tw:text-muted-foreground">
                  {m.gantt_logged_total({ duration: formatLoggedDuration(totalLoggedMinutes) })}
                </span>
              </div>
              {loggedEntries.length === 0 ? (
                <p className="tw:m-0 tw:text-sm tw:text-muted-foreground">
                  {m.gantt_logged_empty()}
                </p>
              ) : (
                <ul className="tw:m-0 tw:list-none tw:divide-y tw:divide-border tw:p-0">
                  {loggedEntries.map((entry) => (
                    <li
                      key={entry.id}
                      className="tw:flex tw:items-center tw:justify-between tw:gap-3 tw:py-2"
                    >
                      <span className="tw:min-w-0">
                        <span className="tw:block tw:break-words">{entry.text}</span>
                        <span className="tw:text-sm tw:text-muted-foreground">
                          {timeTrackingLabelNames.get(entry.label) ?? m.tt_unknown_label()} ·{" "}
                          {dayjs(entry.startTime).format("YYYY-MM-DD")}
                        </span>
                      </span>
                      <span className="tw:flex tw:shrink-0 tw:items-center tw:gap-2">
                        <span className="tw:whitespace-nowrap">
                          {formatLoggedDuration(entry.loggedMinutes)}
                        </span>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={m.gantt_logged_edit_entry_aria({ name: entry.text })}
                          onClick={() => handleEditEntry(entry.id)}
                        >
                          <Icon icon={PencilIcon} />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon-sm"
                          aria-label={m.gantt_logged_unlink_entry_aria({ name: entry.text })}
                          onClick={() => handleUnlinkEntry(entry)}
                        >
                          <Icon icon={CircleXIcon} />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
        <DialogFooter>
          {task && onDelete && (
            <Button variant="destructive" onClick={onDelete} className="tw:mr-auto">
              {m.gantt_task_delete_btn()}
            </Button>
          )}
          <Button variant="outline" onClick={onHide}>
            {m.cancel()}
          </Button>
          <Button type="submit" form="ganttTaskForm">
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
