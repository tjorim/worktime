import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Modal from "react-bootstrap/Modal";
import type { Dayjs } from "dayjs";
import { useForm, useSelector } from "@tanstack/react-form";
import { hasIsoAlpha2Format } from "@/types/countries";
import type { WorkLocationInfo } from "@/types/workLocation";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";

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
  const form = useForm({
    defaultValues: getInitialOtherLocation(existing),
    onSubmit: ({ value }) => {
      if (!hasIsoAlpha2Format(value.countryCode)) return;
      onConfirm(value.countryCode, value.label.trim() || undefined);
    },
  });
  const isCodeValid = useSelector(form.atom, (state) => hasIsoAlpha2Format(state.values.countryCode));

  const handleShow = () => {
    // Reset to initial values when modal opens
    form.reset(getInitialOtherLocation(existing));
  };

  const handleHide = () => {
    onHide();
  };

  return (
    <Modal show={show} onHide={handleHide} onShow={handleShow} centered>
      <Form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {m.calendar_other_location_title({
              date: new Intl.DateTimeFormat(getLocale(), {
                weekday: "long",
                day: "numeric",
                month: "short",
                year: "numeric",
              }).format(date.toDate()),
            })}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <form.Field
            name="countryCode"
            validators={[
              {
                run: ({ value }) => (hasIsoAlpha2Format(value) ? undefined : "invalid"),
                triggers: ["change", "blur"],
              },
            ]}
          >
            {(field) => (
              <Form.Group className="mb-3" controlId="other-location-country">
                <Form.Label>{m.other_location_country_code()}</Form.Label>
                <Form.Control
                  type="text"
                  placeholder={m.other_location_country_placeholder()}
                  value={field.value}
                  onChange={(e) => field.handleChange(e.target.value.toUpperCase().slice(0, 2))}
                  onBlur={field.handleBlur}
                  maxLength={2}
                  isInvalid={field.meta.isTouched && field.errors.length > 0}
                  autoFocus
                  aria-required="true"
                  aria-describedby="other-location-country-feedback"
                />
                <Form.Control.Feedback type="invalid" id="other-location-country-feedback">
                  {m.other_location_country_feedback()}
                </Form.Control.Feedback>
                <Form.Text className="text-muted">{m.other_location_country_help()}</Form.Text>
              </Form.Group>
            )}
          </form.Field>
          <form.Field name="label">
            {(field) => (
              <Form.Group>
                <Form.Label htmlFor="other-location-label-input">
                  {m.form_label()}{" "}
                  <span className="text-muted fw-normal">{m.other_location_label_optional()}</span>
                </Form.Label>
                <Form.Control
                  id="other-location-label-input"
                  type="text"
                  placeholder={m.other_location_label_placeholder()}
                  value={field.value}
                  maxLength={100}
                  onChange={(e) => field.handleChange(e.target.value.slice(0, 100))}
                />
              </Form.Group>
            )}
          </form.Field>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleHide}>
            {m.cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={!isCodeValid}>
            {m.save()}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}
