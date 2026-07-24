import { useEffect, useMemo, useState, type SubmitEventHandler } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ListGroup from "react-bootstrap/ListGroup";
import ReactSelect from "react-select";
import { dayjs } from "@/utils/dateTimeUtils";
import type { GanttTask, RawGanttTask } from "@/types/gantt";
import { bootstrapSelectClassNames } from "@/utils/reactSelectStyles";
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
  const [form, setForm] = useState<FormState>(() => createInitialValue(task));
  const [selectedDeps, setSelectedDeps] = useState<string[]>(() => parseDeps(task?.dependencies));
  const [wasValidated, setWasValidated] = useState(false);
  const {
    tasks: timeTrackingTasks,
    labels: timeTrackingLabels,
    updateTaskTimes,
  } = useTimeTrackingStorage();

  useEffect(() => {
    setForm(createInitialValue(task));
    setSelectedDeps(parseDeps(task?.dependencies));
    if (!show) {
      setWasValidated(false);
    }
  }, [show, task]);

  const isNameValid = form.name.trim().length > 0;
  const isStartDateValid = dayjs(form.start, DATE_FORMAT, true).isValid();
  const isEndDateValid =
    dayjs(form.end, DATE_FORMAT, true).isValid() &&
    !dayjs(form.end, DATE_FORMAT, true).isBefore(dayjs(form.start, DATE_FORMAT, true));

  const hasNameError = wasValidated && !isNameValid;
  const hasStartDateError = wasValidated && !isStartDateValid;
  const hasEndDateError = wasValidated && !isEndDateValid;

  const modalTitle = task ? m.gantt_task_modal_edit() : m.gantt_task_modal_add();
  const submitLabel = task ? m.tt_save_changes() : m.gantt_task_modal_add();

  const isLabelSelectionDisabled = timeTrackingLabels.length === 0;
  const labelOptions = useMemo(
    () => timeTrackingLabels.map((l) => ({ value: l.id, label: l.name })),
    [timeTrackingLabels],
  );
  const selectedLabelOption = useSelectedLabelOption(timeTrackingLabels, form.label);

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

  const handleUnlinkEntry = (entry: { id: string; startTime: string; stopTime?: string | null }) => {
    updateTaskTimes({
      id: entry.id,
      newStartTime: entry.startTime,
      newStopTime: entry.stopTime,
      ganttTaskId: "",
    });
  };

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setWasValidated(true);

    if (!isNameValid || !isStartDateValid || !isEndDateValid) {
      return;
    }

    onSave({
      ...form,
      name: form.name.trim(),
      // Always send an explicit string (never undefined) so a cleared label
      // reliably overwrites an existing one — updateTask only applies a
      // field when it is present, and this form always submits full state.
      label: form.label ?? "",
      dependencies: selectedDeps.length > 0 ? selectedDeps.join(", ") : undefined,
      notes: form.notes?.trim() || undefined,
      progress: form.progress ?? 0,
    });
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{modalTitle}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form as="form" id="ganttTaskForm" onSubmit={handleSubmit} noValidate>
          <Form.Group className="mb-3" controlId="ganttTaskName">
            <Form.Label>{m.gantt_task_name_label()}</Form.Label>
            <Form.Control
              type="text"
              required
              value={form.name}
              isInvalid={hasNameError}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Form.Control.Feedback type="invalid">
              {m.gantt_task_name_required()}
            </Form.Control.Feedback>
          </Form.Group>

          <Form.Group className="mb-3" controlId="ganttTaskLabel">
            <Form.Label>{m.form_label()}</Form.Label>
            <ReactSelect<LabelOption>
              unstyled
              isClearable
              isSearchable
              inputId="ganttTaskLabel"
              isDisabled={isLabelSelectionDisabled}
              placeholder={isLabelSelectionDisabled ? m.tt_add_labels_first() : m.tt_select_label()}
              aria-describedby={isLabelSelectionDisabled ? "ganttTaskLabelHelp" : undefined}
              options={labelOptions}
              value={selectedLabelOption}
              onChange={(selected) => setForm((prev) => ({ ...prev, label: selected?.value ?? "" }))}
              classNames={bootstrapSelectClassNames}
            />
            {isLabelSelectionDisabled ? (
              <Form.Text id="ganttTaskLabelHelp" muted>
                {m.tt_add_labels_first_help()}
              </Form.Text>
            ) : null}
          </Form.Group>

          <div className="d-flex gap-3 mb-3">
            <Form.Group className="flex-fill" controlId="ganttTaskStart">
              <Form.Label>{m.gantt_task_start_label()}</Form.Label>
              <Form.Control
                type="date"
                required
                value={form.start}
                isInvalid={hasStartDateError}
                onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))}
              />
              <Form.Control.Feedback type="invalid">
                {m.gantt_task_start_invalid()}
              </Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="flex-fill" controlId="ganttTaskEnd">
              <Form.Label>{m.gantt_task_end_label()}</Form.Label>
              <Form.Control
                type="date"
                required
                value={form.end}
                isInvalid={hasEndDateError}
                onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))}
              />
              <Form.Control.Feedback type="invalid">
                {m.gantt_task_end_invalid()}
              </Form.Control.Feedback>
            </Form.Group>
          </div>

          <Form.Group className="mb-3" controlId="ganttTaskProgress">
            <Form.Label className="d-flex justify-content-between align-items-center">
              <span>{m.gantt_task_progress_label()}</span>
              <span className="text-muted small">{form.progress ?? 0}%</span>
            </Form.Label>
            <Form.Range
              min={0}
              max={100}
              value={form.progress ?? 0}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, progress: Number(event.target.value) }))
              }
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="ganttTaskDependencies">
            <Form.Label>{m.gantt_task_deps_label()}</Form.Label>
            <ReactSelect<DepOption, true>
              isMulti
              unstyled
              inputId="ganttTaskDependencies"
              placeholder={m.gantt_task_deps_placeholder()}
              options={depOptions}
              value={depValue}
              onChange={(selected) => setSelectedDeps(selected.map((s) => s.value))}
              classNames={{
                ...bootstrapSelectClassNames,
                control: () => "form-control d-flex flex-wrap h-auto gap-1 py-1",
              }}
            />
          </Form.Group>

          <Form.Group className="mb-1" controlId="ganttTaskNotes">
            <Form.Label>{m.gantt_task_notes_label()}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={form.notes ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </Form.Group>
        </Form>
        {task && (
          <section className="border-top mt-3 pt-3" aria-labelledby="ganttLoggedTimeHeading">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <h6 id="ganttLoggedTimeHeading" className="mb-0">
                {m.gantt_logged_time_heading()}
              </h6>
              <span className="text-muted small">
                {m.gantt_logged_total({ duration: formatLoggedDuration(totalLoggedMinutes) })}
              </span>
            </div>
            {loggedEntries.length === 0 ? (
              <p className="text-muted small mb-0">{m.gantt_logged_empty()}</p>
            ) : (
              <ListGroup variant="flush">
                {loggedEntries.map((entry) => (
                  <ListGroup.Item
                    key={entry.id}
                    className="px-0 py-2 d-flex justify-content-between align-items-center gap-3"
                  >
                    <span>
                      <span className="d-block">{entry.text}</span>
                      <span className="text-muted small">
                        {timeTrackingLabelNames.get(entry.label) ?? m.tt_unknown_label()} · {dayjs(entry.startTime).format("YYYY-MM-DD")}
                      </span>
                    </span>
                    <span className="d-flex align-items-center gap-2 flex-shrink-0">
                      <span className="text-nowrap">{formatLoggedDuration(entry.loggedMinutes)}</span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        aria-label={m.gantt_logged_edit_entry_aria({ name: entry.text })}
                        onClick={() => handleEditEntry(entry.id)}
                      >
                        <i className="bi bi-pencil" aria-hidden="true"></i>
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        aria-label={m.gantt_logged_unlink_entry_aria({ name: entry.text })}
                        onClick={() => handleUnlinkEntry(entry)}
                      >
                        <i className="bi bi-x-circle" aria-hidden="true"></i>
                      </Button>
                    </span>
                  </ListGroup.Item>
                ))}
              </ListGroup>
            )}
          </section>
        )}
      </Modal.Body>
      <Modal.Footer>
        {task && onDelete && (
          <Button variant="outline-danger" onClick={onDelete} className="me-auto">
            {m.gantt_task_delete_btn()}
          </Button>
        )}
        <Button variant="outline-secondary" onClick={onHide}>
          {m.cancel()}
        </Button>
        <Button variant="primary" type="submit" form="ganttTaskForm">
          {submitLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
