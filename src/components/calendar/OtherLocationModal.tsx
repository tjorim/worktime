import { useState } from "react";
import type { ChangeEvent, SubmitEvent } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import type { Dayjs } from "dayjs";
import { hasIsoAlpha2Format } from "../../types/countries";
import type { WorkLocationInfo } from "../../types/workLocation";

// Helper to get initial values for countryCode and label
const getInitialOtherLocation = (existing?: WorkLocationInfo) => {
  if (existing?.location === "other") {
    return {
      countryCode: existing.countryCode ?? "",
      label: existing.label ?? "",
    };
  }
  return { countryCode: "", label: "" };
};

interface OtherLocationModalProps {
  show: boolean;
  date: Dayjs;
  existing?: WorkLocationInfo;
  onHide: () => void;
  onConfirm: (countryCode: string, label?: string) => void;
}

/**
 * Modal for setting an "other" work location with a free-text ISO 3166-1 alpha-2
 * country code and optional annotation label.
 *
 * Used when neither home nor office location applies — e.g. a worldwide office,
 * customer site, or conference.
 */
export function OtherLocationModal({
  show,
  date,
  existing,
  onHide,
  onConfirm,
}: OtherLocationModalProps) {
  const initial = getInitialOtherLocation(existing);
  const [countryCode, setCountryCode] = useState(initial.countryCode);
  const [label, setLabel] = useState(initial.label);
  const [touched, setTouched] = useState(false);

  const isCodeValid = hasIsoAlpha2Format(countryCode);

  const handleShow = () => {
    // Reset to initial values when modal opens
    const { countryCode, label } = getInitialOtherLocation(existing);
    setCountryCode(countryCode);
    setLabel(label);
    setTouched(false);
  };

  const handleHide = () => {
    setTouched(false);
    onHide();
  };

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    setTouched(true);
    if (!isCodeValid) return;
    onConfirm(countryCode, label.trim() || undefined);
  };

  const handleCodeChange = (e: ChangeEvent<HTMLInputElement>) => {
    setCountryCode(e.target.value.toUpperCase().slice(0, 2));
  };

  return (
    <Modal show={show} onHide={handleHide} onShow={handleShow} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Other Location — {date.format("dddd, D MMM YYYY")}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3" controlId="other-location-country">
            <Form.Label>Country Code</Form.Label>
            <Form.Control
              type="text"
              placeholder="e.g. DE"
              value={countryCode}
              onChange={handleCodeChange}
              onBlur={() => setTouched(true)}
              maxLength={2}
              isInvalid={touched && !isCodeValid}
              autoFocus
              aria-required="true"
              aria-describedby="other-location-country-feedback"
            />
            <Form.Control.Feedback type="invalid" id="other-location-country-feedback">
              Enter a valid 2-letter ISO country code (e.g. DE, US, FR).
            </Form.Control.Feedback>
            <Form.Text className="text-muted">
              ISO 3166-1 alpha-2 code (2 uppercase letters)
            </Form.Text>
          </Form.Group>
          <Form.Group>
            <Form.Label htmlFor="other-location-label-input">
              Label <span className="text-muted fw-normal">(optional)</span>
            </Form.Label>
            <Form.Control
              id="other-location-label-input"
              type="text"
              placeholder="e.g. Berlin office, Client visit"
              value={label}
              maxLength={100}
              onChange={(e) => setLabel(e.target.value.slice(0, 100))}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleHide}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!isCodeValid}>
            Save
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
