import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { RefObject } from "react";
import * as m from "../../paraglide/messages.js";

interface Step6TimeTrackingSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPrev: () => void;
  onComplete: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step6TimeTrackingSetup({
  isEnabled,
  onToggle,
  onPrev,
  onComplete,
  firstButtonRef,
}: Step6TimeTrackingSetupProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-stopwatch display-4 text-success"></i>
        <h4 className="mt-3">{m.wizard_tracking_heading()}</h4>
        <p className="text-muted">{m.wizard_tracking_subtitle()}</p>
      </div>

      <Alert variant="info" className="mt-3">
        {m.wizard_tracking_info()}
      </Alert>

      <Form className="mt-3">
        <Form.Check
          type="switch"
          id="enable-timetracking"
          label={m.wizard_tracking_enable()}
          checked={isEnabled}
          onChange={(event) => onToggle(event.target.checked)}
        />

        {!isEnabled && (
          <Form.Text className="text-muted d-block mt-2">
            {m.wizard_tracking_disable_hint()}
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
          <i className="bi bi-arrow-left me-1"></i> {m.back()}
        </Button>
        <Button variant="primary" onClick={onComplete} className="order-1 order-sm-2">
          {m.wizard_finish_setup()} <i className="bi bi-check-lg ms-1"></i>
        </Button>
      </div>
    </>
  );
}
