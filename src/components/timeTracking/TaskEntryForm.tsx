import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Form from "react-bootstrap/Form";
import Row from "react-bootstrap/Row";
import { TIME_TRACKING_TAGS, type TimeTrackingTag } from "./constants";

type TaskEntryFormProps = {
  text: string;
  onTextChange: (text: string) => void;
  tag: TimeTrackingTag;
  onTagChange: (tag: TimeTrackingTag) => void;
  start: string;
  onStartChange: (start: string) => void;
  stop: string;
  onStopChange: (stop: string) => void;
  onSubmit: () => void;
};

export function TaskEntryForm({
  text,
  onTextChange,
  tag,
  onTagChange,
  start,
  onStartChange,
  stop,
  onStopChange,
  onSubmit,
}: TaskEntryFormProps) {
  return (
    <Row className="g-3 align-items-end">
      <Col md={4}>
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
        <Form.Group controlId="timeTrackerTag">
          <Form.Label>Tag</Form.Label>
          <Form.Select
            value={tag}
            onChange={(e) => onTagChange(e.target.value as TimeTrackingTag)}
            aria-required="true"
          >
            {TIME_TRACKING_TAGS.map((item) => (
              <option key={item} value={item}>
                {item.replaceAll("-", " ")}
              </option>
            ))}
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
        <Button className="w-100" onClick={onSubmit}>
          Add Task
        </Button>
      </Col>
    </Row>
  );
}
