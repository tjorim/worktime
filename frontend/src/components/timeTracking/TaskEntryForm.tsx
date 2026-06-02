import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import type { ReactElement } from "react";
import ReactSelect from "react-select";
import type { TimeTrackingLabel } from "./constants";
import type { GanttTask } from "@/types/gantt";
import { bootstrapSelectClassNames } from "@/utils/reactSelectStyles";
import { useSelectedLabelOption, type LabelOption } from "@/hooks/useSelectedLabelOption";
import * as m from "@/paraglide/messages.js";

type TaskEntryFormProps = {
  labels: TimeTrackingLabel[];
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
  startDisabledReason?: string;
  addDisabledReason?: string;
  onSubmit: () => void;
  onStartNow: () => void;
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
  startDisabledReason,
  addDisabledReason,
  onSubmit,
  onStartNow,
}: TaskEntryFormProps) {
  const selectedLabelOption = useSelectedLabelOption(labels, label);

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
      <OverlayTrigger
        trigger={["hover", "focus"]}
        overlay={<Tooltip id={tooltipId}>{reason}</Tooltip>}
      >
        <span className="w-100 d-inline-block" tabIndex={0} aria-describedby={tooltipId}>
          {button}
        </span>
      </OverlayTrigger>
    );
  };

  return (
    <Row className="g-3 align-items-end">
      <Col md={3}>
        <Form.Group controlId="timeTrackerTask">
          <Form.Label>{m.form_task()}</Form.Label>
          <Form.Control
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            aria-required="true"
          />
        </Form.Group>
      </Col>
      <Col md={3}>
        <Form.Group controlId="timeTrackerLabel">
          <Form.Label>{m.form_label()}</Form.Label>
          <ReactSelect<LabelOption>
            unstyled
            isClearable
            isSearchable
            inputId="timeTrackerLabel"
            isDisabled={labels.length === 0}
            placeholder={labels.length === 0 ? m.tt_add_labels_first() : m.tt_choose_label()}
            options={labels.map((item) => ({ value: item.id, label: item.name }))}
            value={selectedLabelOption}
            onChange={(selected) => onLabelChange(selected?.value ?? "")}
            classNames={bootstrapSelectClassNames}
          />
        </Form.Group>
      </Col>
      {showGanttPicker && (
        <Col md={3}>
          <Form.Group controlId="timeTrackerGanttTask">
            <Form.Label>{m.tt_gantt_task()}</Form.Label>
            <Form.Select value={ganttTaskId} onChange={(event) => onGanttTaskChange(event.target.value)}>
              <option value="">{m.tt_no_gantt_task()}</option>
              {ganttTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.name}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        </Col>
      )}
      <Col md={2}>
        <Form.Group controlId="timeTrackerStart">
          <Form.Label>{m.form_start()}</Form.Label>
          <Form.Control
            type="time"
            value={start}
            onChange={(e) => onStartChange(e.target.value)}
            aria-required="true"
          />
        </Form.Group>
      </Col>
      <Col md={2}>
        <Form.Group controlId="timeTrackerStop">
          <Form.Label>{m.form_stop()}</Form.Label>
          <Form.Control
            type="time"
            value={stop}
            onChange={(e) => onStopChange(e.target.value)}
            aria-required="true"
          />
        </Form.Group>
      </Col>
      <Col md={2}>
        <div className="d-grid gap-2">
          {renderDisabledTooltipButton(
            "start-now",
            !canStartNow ? startDisabledReason : undefined,
            <Button
              variant="success"
              className="w-100"
              onClick={onStartNow}
              disabled={!canStartNow}
            >
              {m.tt_start_now()}
            </Button>,
          )}
          {renderDisabledTooltipButton(
            "add-task",
            !canSubmit ? addDisabledReason : undefined,
            <Button className="w-100" onClick={onSubmit} disabled={!canSubmit}>
              {m.tt_add_task()}
            </Button>,
          )}
        </div>
      </Col>
    </Row>
  );
}
