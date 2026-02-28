import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { RefObject } from "react";

interface Step7GanttSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step7GanttSetup({
  isEnabled,
  onToggle,
  onPrev,
  onNext,
  firstButtonRef,
}: Step7GanttSetupProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-bar-chart-steps display-4 text-warning"></i>
        <h4 className="mt-3">Personal Gantt Chart</h4>
        <p className="text-muted">
          Plan your personal projects and tasks on a visual timeline with progress tracking and
          dependencies.
        </p>
      </div>

      <Alert variant="info" className="mt-3">
        Gantt tasks are stored locally in your browser. You can export them anytime for backups.
      </Alert>

      <Form className="mt-3">
        <Form.Check
          type="switch"
          id="enable-gantt"
          label="Enable personal Gantt chart"
          checked={isEnabled}
          onChange={(event) => onToggle(event.target.checked)}
        />

        {!isEnabled && (
          <Form.Text className="text-muted d-block mt-2">
            You can enable the Gantt chart later in Settings if you want to start planning
            projects.
          </Form.Text>
        )}
      </Form>

      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2 mt-4">
        <Button
          variant="outline-secondary"
          onClick={onPrev}
          ref={firstButtonRef}
          className="order-2 order-sm-1"
        >
          <i className="bi bi-arrow-left me-1"></i> Back
        </Button>
        <Button variant="primary" onClick={onNext} className="order-1 order-sm-2">
          Continue <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
