import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import { dayjs } from "../../utils/dateTimeUtils";
import { useState } from "react";
import type { TimeTrackingLabel } from "./constants";
import type { StoredTimeTrackingTask } from "./types";

type DailyTaskListProps = {
  tasks: StoredTimeTrackingTask[];
  labels: TimeTrackingLabel[];
  onUpdateTask: (payload: {
    id: string;
    text: string;
    label: string;
    start: string;
    stop?: string | null;
  }) => Promise<boolean> | boolean;
  onRemoveTask: (id: string) => void;
};

export function DailyTaskList({ tasks, labels, onUpdateTask, onRemoveTask }: DailyTaskListProps) {
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editLabel, setEditLabel] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editStop, setEditStop] = useState("");

  const colorByLabelId = labels.reduce<Record<string, string>>((map, label) => {
    map[label.id] = label.color;
    return map;
  }, {});
  const labelNameById = labels.reduce<Record<string, string>>((map, label) => {
    map[label.id] = label.name;
    return map;
  }, {});

  const editingTask = editingTaskId
    ? (tasks.find((task) => task.id === editingTaskId) ?? null)
    : null;

  const closeEditModal = () => {
    setEditingTaskId(null);
    setEditText("");
    setEditLabel("");
    setEditStart("");
    setEditStop("");
  };

  const openEditModal = (task: StoredTimeTrackingTask) => {
    setEditingTaskId(task.id);
    setEditText(task.text);
    setEditLabel(task.label);
    setEditStart(dayjs(task.startTime).format("HH:mm"));
    setEditStop(task.stopTime ? dayjs(task.stopTime).format("HH:mm") : "");
  };

  const submitEditModal = async () => {
    if (!editingTask) {
      return;
    }
    // Only include stop if the task originally had one OR user entered a stop time
    const payload: {
      id: string;
      text: string;
      label: string;
      start: string;
      stop?: string | null;
    } = {
      id: editingTask.id,
      text: editText,
      label: editLabel,
      start: editStart,
    };
    // Include stop if user provided a value (stopped task) or if task was originally stopped
    if (editStop || editingTask.stopTime) {
      payload.stop = editStop || null;
    }
    const didUpdate = await onUpdateTask(payload);
    if (!didUpdate) {
      return;
    }
    closeEditModal();
  };

  if (tasks.length === 0) {
    return (
      <Alert className="mt-3" variant="secondary">
        No time entries yet for this date.
      </Alert>
    );
  }

  return (
    <ListGroup className="mt-3">
      {tasks.map((task) => {
        const startDisplay = dayjs(task.startTime).format("HH:mm");
        const effectiveStopTime = task.stopTime ? dayjs(task.stopTime) : dayjs();
        const stopDisplay = task.stopTime ? effectiveStopTime.format("HH:mm") : "Running";
        return (
          <ListGroup.Item key={task.id}>
            <div className="d-flex justify-content-between align-items-start gap-2">
              <div className="fw-semibold">
                {task.text}{" "}
                <span
                  className="time-tracking-label"
                  style={{
                    backgroundColor: colorByLabelId[task.label] ?? "#6c757d",
                    color: "#000",
                  }}
                >
                  {labelNameById[task.label] ?? "Unknown label"}
                </span>
              </div>
              <div className="d-flex gap-2">
                <Button size="sm" variant="outline-primary" onClick={() => openEditModal(task)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline-danger" onClick={() => onRemoveTask(task.id)}>
                  Remove
                </Button>
              </div>
            </div>
            <div className="small text-muted mb-2">
              Start: {startDisplay} · Stop: {stopDisplay}
            </div>
          </ListGroup.Item>
        );
      })}
      <Modal show={editingTask !== null} onHide={closeEditModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Edit Task</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group controlId="editTaskName" className="mb-3">
              <Form.Label>Task</Form.Label>
              <Form.Control
                value={editText}
                onChange={(event) => setEditText(event.target.value)}
              />
            </Form.Group>
            <Form.Group controlId="editTaskLabel" className="mb-3">
              <Form.Label>Label</Form.Label>
              <Form.Select
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
              >
                {labels.map((label) => (
                  <option key={label.id} value={label.id}>
                    {label.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <div className="d-flex gap-3">
              <Form.Group controlId="editTaskStart" className="flex-fill">
                <Form.Label>Start</Form.Label>
                <Form.Control
                  type="time"
                  value={editStart}
                  onChange={(event) => setEditStart(event.target.value)}
                />
              </Form.Group>
              <Form.Group controlId="editTaskStop" className="flex-fill">
                <Form.Label>Stop</Form.Label>
                <Form.Control
                  type="time"
                  value={editStop}
                  onChange={(event) => setEditStop(event.target.value)}
                />
                <Form.Text className="text-muted">Leave empty to keep task running</Form.Text>
              </Form.Group>
            </div>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeEditModal}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submitEditModal}>
            Save Changes
          </Button>
        </Modal.Footer>
      </Modal>
    </ListGroup>
  );
}
