import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { RefObject } from "react";
import { type CountryCode } from "../../types/countries";
import { CountrySelect } from "../shared/CountrySelect";

interface Step8WorkLocationSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  homeCountry: CountryCode | null;
  officeCountry: CountryCode | null;
  onHomeCountryChange: (country: CountryCode | null) => void;
  onOfficeCountryChange: (country: CountryCode | null) => void;
  onPrev: () => void;
  onComplete: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step8WorkLocationSetup({
  isEnabled,
  onToggle,
  homeCountry,
  officeCountry,
  onHomeCountryChange,
  onOfficeCountryChange,
  onPrev,
  onComplete,
  firstButtonRef,
}: Step8WorkLocationSetupProps) {
  return (
    <>
      <div className="text-center mb-4">
        <i className="bi bi-globe display-4 text-primary"></i>
        <h4 className="mt-3">Track Where You Work</h4>
        <p className="text-muted">
          Cross-border tracking logs your work location per day, making tax reporting easier when
          you work from different countries.
        </p>
      </div>

      <Alert variant="info" className="mt-3">
        You can mark each day as home, office, or another country directly on the calendar.
      </Alert>

      <Form className="mt-3">
        <Form.Check
          type="switch"
          id="enable-work-location"
          label="Enable cross-border tracking"
          checked={isEnabled}
          onChange={(event) => onToggle(event.target.checked)}
        />

        {!isEnabled && (
          <Form.Text className="text-muted d-block mt-2">
            You can enable this later in Settings under Cross-Border Tracking.
          </Form.Text>
        )}

        {isEnabled && (
          <div className="mt-3 d-flex flex-column gap-3">
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 gap-sm-3">
              <div>
                <div className="fw-medium">Home Country</div>
                <small className="text-muted">Country where you are based</small>
              </div>
              <div className="flex-fill">
                <CountrySelect
                  value={homeCountry}
                  onChange={onHomeCountryChange}
                  ariaLabel="Home country"
                />
              </div>
            </div>

            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 gap-sm-3">
              <div>
                <div className="fw-medium">Office Country</div>
                <small className="text-muted">Country where your office is located</small>
              </div>
              <div className="flex-fill">
                <CountrySelect
                  value={officeCountry}
                  onChange={onOfficeCountryChange}
                  ariaLabel="Office country"
                />
              </div>
            </div>
          </div>
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
        <Button variant="primary" onClick={onComplete} className="order-1 order-sm-2">
          Finish Setup <i className="bi bi-check-lg ms-1"></i>
        </Button>
      </div>
    </>
  );
}
