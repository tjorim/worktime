import { useEffect, useMemo, useState, type SubmitEventHandler } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ReactSelect from "react-select";
import { dayjs } from "../../utils/dateTimeUtils";
import type { GanttTask, RawGanttTask } from "../../types/gantt";
import { bootstrapSelectClassNames } from "../../utils/reactSelectStyles";

type DepOption = { value: string; label: string };

export type GanttTaskFormInput = Omit<RawGanttTask, "id">;

interface GanttTaskModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (task: GanttTaskFormInput) => void;
  task?: GanttTask;
  existingTasks: Array<Pick<GanttTask, "id" | "name">>;
  onDelete?: () => void;
}

const DATE_FORMAT = "YYYY-MM-DD";

type FormState = Omit<GanttTaskFormInput, "dependencies">;

function createInitialValue(task?: GanttTask): FormState {
  if (task) {
    return {
      name: task.name,
      start: task.start,
      end: task.end,
      progress: task.progress,
      notes: task.notes,
    };
  }

  const today = dayjs().format(DATE_FORMAT);
  return {
    name: "",
    start: today,
    end: today,
    progress: 0,
    notes: "",
  };
}

function parseDeps(dependencies?: string): string[] {
  return (dependencies ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
}

export function GanttTaskModal({
  show,
  onHide,
  onSave,
  task,
  existingTasks,
  onDelete,
}: GanttTaskModalProps) {
  const [form, setForm] = useState<FormState>(() => createInitialValue(task));
  const [selectedDeps, setSelectedDeps] = useState<string[]>(() => parseDeps(task?.dependencies));
  const [wasValidated, setWasValidated] = useState(false);

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

  const modalTitle = task ? "Edit Task" : "Add Task";
  const submitLabel = task ? "Save Changes" : "Add Task";

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
        label: depOptions.find((o) => o.value === id)?.label ?? `Unknown (${id.slice(0, 8)}…)`,
      })),
    [selectedDeps, depOptions],
  );

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setWasValidated(true);

    if (!isNameValid || !isStartDateValid || !isEndDateValid) {
      return;
    }

    onSave({
      ...form,
      name: form.name.trim(),
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
            <Form.Label>Name</Form.Label>
            <Form.Control
              type="text"
              required
              value={form.name}
              isInvalid={hasNameError}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <Form.Control.Feedback type="invalid">Task name is required.</Form.Control.Feedback>
          </Form.Group>

          <div className="d-flex gap-3 mb-3">
            <Form.Group className="flex-fill" controlId="ganttTaskStart">
              <Form.Label>Start date</Form.Label>
              <Form.Control
                type="date"
                required
                value={form.start}
                isInvalid={hasStartDateError}
                onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))}
              />
              <Form.Control.Feedback type="invalid">
                Enter a valid start date.
              </Form.Control.Feedback>
            </Form.Group>
            <Form.Group className="flex-fill" controlId="ganttTaskEnd">
              <Form.Label>End date</Form.Label>
              <Form.Control
                type="date"
                required
                value={form.end}
                isInvalid={hasEndDateError}
                onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))}
              />
              <Form.Control.Feedback type="invalid">
                End date must be on or after the start date.
              </Form.Control.Feedback>
            </Form.Group>
          </div>

          <Form.Group className="mb-3" controlId="ganttTaskProgress">
            <Form.Label className="d-flex justify-content-between align-items-center">
              <span>Progress</span>
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
            <Form.Label>Dependencies</Form.Label>
            <ReactSelect<DepOption, true>
              isMulti
              unstyled
              inputId="ganttTaskDependencies"
              placeholder="Search tasks…"
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
            <Form.Label>Notes</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={form.notes ?? ""}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        {task && onDelete && (
          <Button variant="outline-danger" onClick={onDelete} className="me-auto">
            Delete Task
          </Button>
        )}
        <Button variant="outline-secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="ganttTaskForm">
          {submitLabel}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
