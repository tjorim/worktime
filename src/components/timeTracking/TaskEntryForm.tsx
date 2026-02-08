import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Row from "react-bootstrap/Row";
import Tooltip from "react-bootstrap/Tooltip";
import type { ReactElement } from "react";
import type { TimeTrackingLabel } from "./constants";

type TaskEntryFormProps = {
  labels: TimeTrackingLabel[];
  text: string;
  onTextChange: (text: string) => void;
  labelId: string;
  onLabelChange: (labelId: string) => void;
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
  labelId,
  onLabelChange,
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
          <Form.Label>Task</Form.Label>
          <Form.Control
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            aria-required="true"
          />
        </Form.Group>
      </Col>
      <Col md={3}>
        <Form.Group controlId="timeTrackerLabel">
          <Form.Label>Label</Form.Label>
            <Form.Select
            value={labelId}
            onChange={(e) => onLabelChange(e.target.value)}
            aria-required="true"
            disabled={labels.length === 0}
          >
            {labels.length === 0 ? (
              <option value="">Add labels first</option>
            ) : (
              labels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            )}
          </Form.Select>
        </Form.Group>
      </Col>
      <Col md={2}>
        <Form.Group controlId="timeTrackerStart">
          <Form.Label>Start</Form.Label>
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
          <Form.Label>Stop</Form.Label>
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
              Start Now
            </Button>,
          )}
          {renderDisabledTooltipButton(
            "add-task",
            !canSubmit ? addDisabledReason : undefined,
            <Button className="w-100" onClick={onSubmit} disabled={!canSubmit}>
              Add Task
            </Button>,
          )}
        </div>
      </Col>
    </Row>
  );
}
