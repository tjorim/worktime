import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { VacationAllowanceUnit } from "../../utils/vacationCalculations";

interface Step5VacationAllowanceProps {
  vacationAmount: string;
  vacationUnit: VacationAllowanceUnit;
  onVacationAmountChange: (amount: string) => void;
  onVacationUnitChange: (unit: VacationAllowanceUnit) => void;
  onPrev: () => void;
  onSkip: () => void;
  onComplete: () => void;
  isInvalid: boolean;
  isValid: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step5VacationAllowance({
  vacationAmount,
  vacationUnit,
  onVacationAmountChange,
  onVacationUnitChange,
  onPrev,
  onSkip,
  onComplete,
  isInvalid,
  isValid,
  firstButtonRef,
}: Step5VacationAllowanceProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-calendar-check display-4 text-primary"></i>
        <h4 className="mt-3">Set Up Vacation Tracking (Optional)</h4>
        <p className="text-muted">
          Track your vacation allowance and see how much time off you have remaining. You can skip
          this and set it up later in Settings.
        </p>
      </div>

      <Form>
        <Form.Group className="mb-3" controlId="vacationAmount">
          <Form.Label>Annual vacation allowance</Form.Label>
          <Form.Control
            type="number"
            min={0}
            step={0.5}
            placeholder="e.g., 25"
            value={vacationAmount}
            onChange={(e) => onVacationAmountChange(e.target.value)}
            isInvalid={isInvalid}
          />
          <Form.Control.Feedback type="invalid">
            Please enter a valid number (0 or greater)
          </Form.Control.Feedback>
          <Form.Text className="text-muted">Leave empty to skip vacation tracking</Form.Text>
        </Form.Group>

        <Form.Group controlId="vacationUnit">
          <Form.Label>Unit</Form.Label>
          <div className="d-flex gap-3">
            <Form.Check
              type="radio"
              id="unit-days"
              name="vacationUnit"
              label="Days"
              checked={vacationUnit === "days"}
              onChange={() => onVacationUnitChange("days")}
            />
            <Form.Check
              type="radio"
              id="unit-hours"
              name="vacationUnit"
              label="Hours"
              checked={vacationUnit === "hours"}
              onChange={() => onVacationUnitChange("hours")}
            />
          </div>
        </Form.Group>
      </Form>

      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2 mt-4">
        <Button
          variant="outline-secondary"
          onClick={onPrev}
          ref={firstButtonRef}
          className="order-3 order-sm-1"
        >
          <i className="bi bi-arrow-left me-2"></i>
          Back
        </Button>
        <div className="d-flex gap-2 order-1 order-sm-2">
          <Button variant="outline-secondary" onClick={onSkip} className="flex-fill flex-sm-grow-0">
            Skip
          </Button>
          <Button
            variant="primary"
            onClick={onComplete}
            disabled={isInvalid}
            className="flex-fill flex-sm-grow-0"
          >
            {isValid ? "Save & Complete" : "Complete"}
            <i className="bi bi-check-lg ms-2"></i>
          </Button>
        </div>
      </div>
    </>
  );
}
