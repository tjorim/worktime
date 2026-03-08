import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import type { RefObject } from "react";
import { dayjs } from "../../utils/dateTimeUtils";
import {
  isValidVacationAllowanceUnit,
  type VacationAllowanceUnit,
} from "../../utils/vacationCalculations";
import * as m from "../../paraglide/messages.js";

interface Step5TimeOffSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  vacationAmount: string;
  vacationUnit: VacationAllowanceUnit;
  onVacationAmountChange: (amount: string) => void;
  onVacationUnitChange: (unit: VacationAllowanceUnit) => void;
  isInvalid: boolean;
  onPrev: () => void;
  onNext: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step5TimeOffSetup({
  isEnabled,
  onToggle,
  vacationAmount,
  vacationUnit,
  onVacationAmountChange,
  onVacationUnitChange,
  isInvalid,
  onPrev,
  onNext,
  firstButtonRef,
}: Step5TimeOffSetupProps) {
  const currentYear = dayjs().year();

  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-calendar-check display-4 text-primary"></i>
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

        {isEnabled ? (
          <>
            <Row className="g-3 mt-1">
              <Col md={8}>
                <Form.Group className="mb-0" controlId="vacationAmount">
                  <Form.Label>
                    {m.wizard_timeoff_vacation_label({ year: String(currentYear) })}
                  </Form.Label>
                  <Form.Control
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder={m.wizard_timeoff_vacation_placeholder()}
                    value={vacationAmount}
                    onChange={(e) => onVacationAmountChange(e.target.value)}
                    isInvalid={isInvalid}
                    aria-required={false}
                    aria-describedby="vacation-amount-help vacation-amount-error"
                  />
                  <Form.Control.Feedback type="invalid" id="vacation-amount-error">
                    {m.wizard_timeoff_vacation_invalid()}
                  </Form.Control.Feedback>
                  <Form.Text className="text-muted" id="vacation-amount-help">
                    {m.wizard_timeoff_vacation_help({ year: String(currentYear) })}
                  </Form.Text>
                </Form.Group>
              </Col>
              <Col md={4}>
                <Form.Group controlId="vacationUnit">
                  <Form.Label>{m.wizard_timeoff_unit_label()}</Form.Label>
                  <Form.Select
                    value={vacationUnit}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (isValidVacationAllowanceUnit(value)) {
                        onVacationUnitChange(value);
                      }
                    }}
                  >
                    <option value="days">{m.timeoff_vacation_unit_days()}</option>
                    <option value="hours">{m.timeoff_vacation_unit_hours()}</option>
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </>
        ) : (
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
          <i className="bi bi-arrow-left me-1"></i> {m.back()}
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          className="order-1 order-sm-2"
          disabled={isEnabled && isInvalid}
        >
          {m.continue()}
          <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}

