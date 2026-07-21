import { useMemo } from "react";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import ReactSelect from "react-select";
import { dayjs } from "@/utils/dateTimeUtils";
import type { TimeTrackingLabel } from "./constants";
import { BREAK_DURATION_MINUTES } from "./timeUtils";
import { bootstrapSelectClassNames } from "@/utils/reactSelectStyles";
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
  labels: TimeTrackingLabel[];
  ganttTasks?: GanttTask[];
  showGanttPicker?: boolean;
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
  ganttTasks = [],
  showGanttPicker = false,
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

  const selectedLabelOption = useSelectedLabelOption(labels, value.label);
  const selectedGanttTaskOption = useSelectedGanttTaskOption(ganttTasks, value.ganttTaskId);
  const ganttTaskOptions = useMemo(
    () => ganttTasks.map((task) => ({ value: task.id, label: task.name })),
    [ganttTasks],
  );

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{m.tt_edit_task_title()}</Modal.Title>
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
            <Form.Label>{m.form_task()}</Form.Label>
            <Form.Control
              value={value.text}
              onChange={(event) => onChange({ ...value, text: event.target.value })}
            />
          </Form.Group>
          <Form.Group controlId="editTaskLabel" className="mb-3">
            <Form.Label>{m.form_label()}</Form.Label>
            <ReactSelect<LabelOption>
              unstyled
              isClearable
              isSearchable
              inputId="editTaskLabel"
              placeholder={m.tt_select_label()}
              options={labels.map((l) => ({ value: l.id, label: l.name }))}
              value={selectedLabelOption}
              onChange={(selected) => onChange({ ...value, label: selected?.value ?? "" })}
              classNames={bootstrapSelectClassNames}
            />
          </Form.Group>
          {showGanttPicker && (
            <Form.Group controlId="editTaskGanttTask" className="mb-3">
              <Form.Label>{m.tt_gantt_task()}</Form.Label>
              <ReactSelect<GanttTaskOption>
                unstyled
                isClearable
                isSearchable
                inputId="editTaskGanttTask"
                placeholder={m.tt_no_gantt_task()}
                options={ganttTaskOptions}
                value={selectedGanttTaskOption}
                onChange={(selected) => onChange({ ...value, ganttTaskId: selected?.value })}
                classNames={bootstrapSelectClassNames}
              />
            </Form.Group>
          )}
          <div className="d-flex gap-3 mb-3">
            <Form.Group controlId="editTaskStart" className="flex-fill">
              <Form.Label>{m.form_start()}</Form.Label>
              <Form.Control
                type="time"
                value={value.start}
                onChange={(event) => onChange({ ...value, start: event.target.value })}
              />
            </Form.Group>
            <Form.Group controlId="editTaskStop" className="flex-fill">
              <Form.Label>{m.form_stop()}</Form.Label>
              <Form.Control
                type="time"
                value={value.stop}
                onChange={(event) => onChange({ ...value, stop: event.target.value })}
              />
              <Form.Text className="text-muted">{m.tt_stop_empty_hint()}</Form.Text>
            </Form.Group>
          </div>
          <Form.Check
            id="editTaskBreak"
            type="checkbox"
            label={m.tt_includes_break({ minutes: BREAK_DURATION_MINUTES })}
            checked={value.includesBreak}
            onChange={(event) => onChange({ ...value, includesBreak: event.target.checked })}
            disabled={!value.includesBreak && isTooShortForBreak}
          />
          {isTooShortForBreak && !value.includesBreak && (
            <Form.Text className="text-danger" data-testid="break-too-short-help">
              {m.tt_task_too_short_break()}
            </Form.Text>
          )}
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          {m.cancel()}
        </Button>
        <Button variant="primary" type="submit" form="taskEditForm">
          {m.tt_save_changes()}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
