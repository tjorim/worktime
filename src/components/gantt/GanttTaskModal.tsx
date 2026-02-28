import { useEffect, useMemo, useState, type SubmitEventHandler } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import { dayjs } from "../../utils/dateTimeUtils";
import type { GanttTask, RawGanttTask } from "../../types/gantt";

export type GanttTaskFormInput = Omit<RawGanttTask, "id">;

interface GanttTaskModalProps {
  show: boolean;
  onHide: () => void;
  onSave: (task: GanttTaskFormInput) => void;
  task?: GanttTask;
  existingTaskIds: string[];
  onDelete?: () => void;
}

const DATE_FORMAT = "YYYY-MM-DD";

function createInitialValue(task?: GanttTask): GanttTaskFormInput {
  if (task) {
    return {
      name: task.name,
      start: task.start,
      end: task.end,
      progress: task.progress,
      dependencies: task.dependencies,
      notes: task.notes,
    };
  }

  const today = dayjs().format(DATE_FORMAT);
  return {
    name: "",
    start: today,
    end: today,
    progress: 0,
    dependencies: "",
    notes: "",
  };
}

export function GanttTaskModal({
  show,
  onHide,
  onSave,
  task,
  existingTaskIds,
  onDelete,
}: GanttTaskModalProps) {
  const [form, setForm] = useState<GanttTaskFormInput>(() => createInitialValue(task));
  const [wasValidated, setWasValidated] = useState(false);

  useEffect(() => {
    setForm(createInitialValue(task));
    if (!show) {
      setWasValidated(false);
    }
  }, [show, task]);

  const unknownDependencies = useMemo(() => {
    const enteredDependencies = (form.dependencies ?? "")
      .split(",")
      .map((dependencyId) => dependencyId.trim())
      .filter(Boolean);

    if (enteredDependencies.length === 0) {
      return [];
    }

    const validIds = new Set(existingTaskIds.filter((id) => id !== task?.id));
    return enteredDependencies.filter((dependencyId) => !validIds.has(dependencyId));
  }, [existingTaskIds, form.dependencies, task?.id]);

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

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = (event) => {
    event.preventDefault();
    setWasValidated(true);

    if (!isNameValid || !isStartDateValid || !isEndDateValid) {
      return;
    }

    onSave({
      ...form,
      name: form.name.trim(),
      dependencies: form.dependencies?.trim() || undefined,
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
            <Form.Control
              type="text"
              placeholder="task-1, task-2"
              value={form.dependencies ?? ""}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, dependencies: event.target.value }))
              }
            />
            <Form.Text className="text-muted">
              Existing task IDs: {existingTaskIds.length > 0 ? existingTaskIds.join(", ") : "none"}
            </Form.Text>
            {unknownDependencies.length > 0 && (
              <Form.Text className="text-warning d-block" data-testid="unknown-dependencies">
                Unknown dependency IDs: {unknownDependencies.join(", ")}
              </Form.Text>
            )}
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
