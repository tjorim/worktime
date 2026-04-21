import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { RefObject } from "react";
import * as m from "@/paraglide/messages.js";

interface Step5TimeOffSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  isLastStep?: boolean;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step5TimeOffSetup({
  isEnabled,
  onToggle,
  onPrev,
  onNext,
  isLastStep,
  firstButtonRef,
}: Step5TimeOffSetupProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-calendar-check display-4 text-primary" aria-hidden="true"></i>
        <h4 className="mt-3">{m.wizard_timeoff_heading()}</h4>
        <p className="text-muted">{m.wizard_timeoff_subtitle()}</p>
      </div>

      <Alert variant="info" className="mt-3">
        <ul className="mb-0">
          <li>{m.wizard_timeoff_benefit1()}</li>
          <li>{m.wizard_timeoff_benefit2()}</li>
          <li>{m.wizard_timeoff_benefit3()}</li>
        </ul>
      </Alert>

      <Form className="mt-3">
        <Form.Check
          type="switch"
          id="enable-timeoff"
          label={m.wizard_timeoff_enable()}
          checked={isEnabled}
          onChange={(event) => onToggle(event.target.checked)}
        />

        {!isEnabled && (
          <Form.Text className="text-muted d-block mt-2">
            {m.wizard_timeoff_disable_hint()}
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
          <i className="bi bi-arrow-left me-1" aria-hidden="true"></i> {m.back()}
        </Button>
        <Button variant="primary" onClick={onNext} className="order-1 order-sm-2">
          {isLastStep ? m.wizard_finish_setup() : m.continue()}
          <i className={`bi ${isLastStep ? "bi-check-lg" : "bi-arrow-right"} ms-1`} aria-hidden="true"></i>
        </Button>
      </div>
    </>
  );
}
