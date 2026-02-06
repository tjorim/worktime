import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { RefObject } from "react";

interface Step5TimeOffSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step5TimeOffSetup({
  isEnabled,
  onToggle,
  onPrev,
  onNext,
  firstButtonRef,
}: Step5TimeOffSetupProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-calendar-check display-4 text-primary"></i>
        <h4 className="mt-3">Enable Time Off Tracking</h4>
        <p className="text-muted">
          Time off tracking keeps vacations and leave alongside your schedule so you can plan with
          confidence.
        </p>
      </div>

      <Form>
        <Form.Check
          type="switch"
          id="enable-timeoff"
          label="Enable time off tracking"
          checked={isEnabled}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </Form>

      {isEnabled ? (
        <Alert variant="info" className="mt-3">
          <ul className="mb-0">
            <li>See time-off events directly on your calendar and Today view.</li>
            <li>Import or export .hday files to share with teammates.</li>
            <li>Track vacation allowance to see remaining balance.</li>
          </ul>
        </Alert>
      ) : (
        <Alert variant="secondary" className="mt-3">
          You can enable time off tracking later in Settings if you change your mind.
        </Alert>
      )}

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
          {isEnabled ? "Set Vacation Allowance" : "Continue"}
          <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
