import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import type { RefObject } from "react";
import { type CountryCode } from "@/types/countries";
import { CountrySelect } from "@/components/shared/CountrySelect";
import * as m from "@/paraglide/messages.js";

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
        <h4 className="mt-3">{m.wizard_location_heading()}</h4>
        <p className="text-muted">{m.wizard_location_subtitle()}</p>
      </div>

      <Alert variant="info" className="mt-3">
        {m.wizard_location_info()}
      </Alert>

      <Form className="mt-3">
        <Form.Check
          type="switch"
          id="enable-work-location"
          label={m.wizard_location_enable()}
          checked={isEnabled}
          onChange={(event) => onToggle(event.target.checked)}
        />

        {!isEnabled && (
          <Form.Text className="text-muted d-block mt-2">
            {m.wizard_location_disable_hint()}
          </Form.Text>
        )}

        {isEnabled && (
          <div className="mt-3 d-flex flex-column gap-3">
            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 gap-sm-3">
              <div>
                <div className="fw-medium">{m.home_country_label()}</div>
                <small className="text-muted">{m.home_country_description()}</small>
              </div>
              <div className="flex-fill">
                <CountrySelect
                  value={homeCountry}
                  onChange={onHomeCountryChange}
                  ariaLabel={m.home_country_label()}
                />
              </div>
            </div>

            <div className="d-flex flex-column flex-sm-row justify-content-between align-items-sm-center gap-2 gap-sm-3">
              <div>
                <div className="fw-medium">{m.office_country_label()}</div>
                <small className="text-muted">{m.office_country_description()}</small>
              </div>
              <div className="flex-fill">
                <CountrySelect
                  value={officeCountry}
                  onChange={onOfficeCountryChange}
                  ariaLabel={m.office_country_label()}
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
          <i className="bi bi-arrow-left me-1"></i> {m.back()}
        </Button>
        <Button variant="primary" onClick={onComplete} className="order-1 order-sm-2">
          {m.continue()} <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
