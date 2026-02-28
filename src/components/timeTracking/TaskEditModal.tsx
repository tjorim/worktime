import { useMemo } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ReactSelect from "react-select";
import { dayjs } from "../../utils/dateTimeUtils";
import type { TimeTrackingLabel } from "./constants";
import { BREAK_DURATION_MINUTES } from "./timeUtils";
import { bootstrapSelectClassNames } from "../../utils/reactSelectStyles";

type LabelOption = { value: string; label: string };

export type TaskEditForm = {
  text: string;
  label: string;
  start: string;
  stop: string;
  includesBreak: boolean;
};

type TaskEditModalProps = {
  show: boolean;
  labels: TimeTrackingLabel[];
  value: TaskEditForm;
  onChange: (value: TaskEditForm) => void;
  onClose: () => void;
  onSubmit: () => void;
  error: string;
  info?: string;
};

export function TaskEditModal({
  show,
  labels,
  value,
  onChange,
  onClose,
  onSubmit,
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

  const selectedLabelOption = useMemo(() => {
    const selected = labels.find((l) => l.id === value.label);
    return selected ? { value: selected.id, label: selected.name } : null;
  }, [labels, value.label]);

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Edit Task</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" aria-live="polite">
            {error}
          </Alert>
        )}
        {info && (
          <Alert variant="info" aria-live="polite">
            {info}
          </Alert>
        )}
        <Form
          as="form"
          id="taskEditForm"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <Form.Group controlId="editTaskName" className="mb-3">
            <Form.Label>Task</Form.Label>
            <Form.Control
              value={value.text}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
            />
          </Form.Group>
          <Form.Group controlId="editTaskLabel" className="mb-3">
            <Form.Label>Label</Form.Label>
            <ReactSelect<LabelOption>
              unstyled
              isClearable
              isSearchable
              inputId="editTaskLabel"
              placeholder="Select a label"
              options={labels.map((l) => ({ value: l.id, label: l.name }))}
              value={selectedLabelOption}
              onChange={(selected) => onChange({ ...value, label: selected?.value ?? "" })}
              classNames={bootstrapSelectClassNames}
            />
          </Form.Group>
          <div className="d-flex gap-3 mb-3">
            <Form.Group controlId="editTaskStart" className="flex-fill">
              <Form.Label>Start</Form.Label>
              <Form.Control
                type="time"
                value={value.start}
                onChange={(event) => onChange({ ...value, start: event.target.value })}
              />
            </Form.Group>
            <Form.Group controlId="editTaskStop" className="flex-fill">
              <Form.Label>Stop</Form.Label>
              <Form.Control
                type="time"
                value={value.stop}
                onChange={(event) => onChange({ ...value, stop: event.target.value })}
              />
              <Form.Text className="text-muted">Leave empty to keep task running</Form.Text>
            </Form.Group>
          </div>
          <Form.Check
            id="editTaskBreak"
            type="checkbox"
            label={`Includes ${BREAK_DURATION_MINUTES}min break`}
            checked={value.includesBreak}
            onChange={(event) => onChange({ ...value, includesBreak: event.target.checked })}
            disabled={!value.includesBreak && isTooShortForBreak}
          />
          {isTooShortForBreak && !value.includesBreak && (
            <Form.Text className="text-danger" data-testid="break-too-short-help">
              Task too short for a break
            </Form.Text>
          )}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" form="taskEditForm">
          Save Changes
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
