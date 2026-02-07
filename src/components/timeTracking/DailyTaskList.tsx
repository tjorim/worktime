import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Row from "react-bootstrap/Row";
import { dayjs } from "../../utils/dateTimeUtils";
import type { StoredTimeTrackingTask } from "./types";
import { tagToClass } from "./timeUtils";

type DailyTaskListProps = {
  tasks: StoredTimeTrackingTask[];
  editTimes: Record<string, { start: string; stop: string }>;
  onEditTimesChange: (
    updater: (
      prev: Record<string, { start: string; stop: string }>,
    ) => Record<string, { start: string; stop: string }>,
  ) => void;
  onUpdateTask: (taskId: string) => void;
  onRemoveTask: (id: string) => void;
};

export function DailyTaskList({
  tasks,
  editTimes,
  onEditTimesChange,
  onUpdateTask,
  onRemoveTask,
}: DailyTaskListProps) {
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
        const stopInputValue = effectiveStopTime.format("HH:mm");
        const edit = editTimes[task.id] ?? { start: startDisplay, stop: stopInputValue };
        return (
          <ListGroup.Item key={task.id}>
            <div className="fw-semibold">
              {task.text}{" "}
              <span className={`time-tracking-tag time-tracking-tag-${tagToClass(task.tag)}`}>
                {task.tag}
              </span>
            </div>
            <div className="small text-muted mb-2">
              Start: {startDisplay} · Stop: {stopDisplay}
            </div>
            <Row className="g-2 align-items-center">
              <Col md={3}>
                <Form.Control
                  type="time"
                  value={edit.start}
                  aria-label={`Start time for ${task.id}`}
                  onChange={(event) =>
                    onEditTimesChange((prev) => ({
                      ...prev,
                      [task.id]: { ...edit, start: event.target.value },
                    }))
                  }
                />
              </Col>
              <Col md={3}>
                <Form.Control
                  type="time"
                  value={edit.stop}
                  aria-label={`Stop time for ${task.id}`}
                  onChange={(event) =>
                    onEditTimesChange((prev) => ({
                      ...prev,
                      [task.id]: { ...edit, stop: event.target.value },
                    }))
                  }
                />
              </Col>
              <Col md={6} className="d-flex gap-2">
                <Button size="sm" variant="outline-primary" onClick={() => onUpdateTask(task.id)}>
                  Update
                </Button>
                <Button size="sm" variant="outline-danger" onClick={() => onRemoveTask(task.id)}>
                  Remove
                </Button>
              </Col>
            </Row>
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
}
