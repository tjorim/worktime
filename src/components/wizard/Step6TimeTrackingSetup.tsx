import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { RefObject } from "react";

interface Step6TimeTrackingSetupProps {
  isEnabled: boolean;
  weeklyTargetHours: string;
  onToggle: (enabled: boolean) => void;
  onWeeklyTargetHoursChange: (hours: string) => void;
  onPrev: () => void;
  onComplete: () => void;
  isInvalid: boolean;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step6TimeTrackingSetup({
  isEnabled,
  weeklyTargetHours,
  onToggle,
  onWeeklyTargetHoursChange,
  onPrev,
  onComplete,
  isInvalid,
  firstButtonRef,
}: Step6TimeTrackingSetupProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-stopwatch display-4 text-success"></i>
        <h4 className="mt-3">Set Up Time Tracking</h4>
        <p className="text-muted">
          Time tracking helps you log tasks and review weekly summaries for better workload
          planning.
        </p>
      </div>

      <Alert variant="info" className="mt-3">
        Time tracking data stays on this device. Export anytime for backups.
      </Alert>

      <Form className="mt-3">
        <Form.Check
          type="switch"
          id="enable-timetracking"
          label="Enable time tracking"
          checked={isEnabled}
          onChange={(event) => onToggle(event.target.checked)}
        />

        {isEnabled ? (
          <Form.Group className="mt-3" controlId="weeklyTargetHours">
            <Form.Label>Weekly target hours</Form.Label>
            <Form.Control
              type="number"
              min={0}
              step={0.5}
              value={weeklyTargetHours}
              onChange={(event) => onWeeklyTargetHoursChange(event.target.value)}
              isInvalid={isInvalid}
            />
            <Form.Control.Feedback type="invalid">
              Enter a valid number (0 or greater).
            </Form.Control.Feedback>
            <Form.Text className="text-muted">
              Used for weekly summaries and progress tracking.
            </Form.Text>
          </Form.Group>
        ) : (
          <Form.Text className="text-muted d-block mt-2">
            You can enable time tracking later in Settings if you want to start logging hours.
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
        <Button
          variant="primary"
          onClick={onComplete}
          disabled={isEnabled && isInvalid}
          className="order-1 order-sm-2"
        >
          Finish Setup <i className="bi bi-check-lg ms-1"></i>
        </Button>
      </div>
    </>
  );
}
