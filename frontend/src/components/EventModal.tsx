import type { RefObject } from "react";
import { Badge, Button, Card, Col, Form, Modal, Row } from "react-bootstrap";
import type { EventFlag, TimeLocationFlag, TypeFlag } from "@/lib/hday/types";
import { getEventTypeLabel } from "@/lib/hday/presentation";
import { getWeekdayName } from "../utils/dateTimeUtils";
import * as m from "../paraglide/messages.js";

type FlagCheckboxProps = {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
  name: string;
  type?: "checkbox" | "radio";
};

/**
 * Render a labelled checkbox or radio input using React-Bootstrap's Form.Check.
 *
 * @param id - DOM id for the input element
 * @param label - Visible label text for the control
 * @param checked - Whether the control is selected
 * @param onChange - Change event handler for the input
 * @param name - Name attribute used to group related controls
 * @param type - Input type; `"checkbox"` or `"radio"` (defaults to `"checkbox"`)
 * @returns The configured Form.Check element
 */
function FlagCheckbox({
  id,
  label,
  checked,
  onChange,
  name,
  type = "checkbox",
}: FlagCheckboxProps) {
  return (
    <Form.Check
      id={id}
      name={name}
      type={type}
      label={label}
      checked={checked}
      onChange={onChange}
    />
  );
}

/**
 * Get human-readable label for an event flag.
 * Used for displaying flags as badges in view mode.
 *
 * @param flag - The event flag key
 * @returns Human-readable label for the flag
 */
function getFlagLabel(flag: EventFlag): string {
  const labels: Record<string, () => string> = {
    business: m.timeoff_flag_business,
    course: m.timeoff_flag_course,
    in: m.timeoff_flag_in,
    weekend: m.timeoff_flag_weekend,
    birthday: m.timeoff_flag_birthday,
    holiday: m.timeoff_flag_holiday,
    ill: m.timeoff_flag_ill,
    other: m.timeoff_flag_other,
    half_am: m.timeoff_flag_half_am,
    half_pm: m.timeoff_flag_half_pm,
    onsite: m.timeoff_flag_onsite,
    no_fly: m.timeoff_flag_no_fly,
    can_fly: m.timeoff_flag_can_fly,
  };
  return labels[flag]?.() ?? flag;
}

/**
 * Props for the FlagSection component
 */
type FlagSectionProps<Flag extends EventFlag | "none"> = {
  mode: "add" | "edit" | "view";
  title: string;
  fieldsetTitle?: string;
  flagOptions: Array<[Flag, string]>;
  eventFlags: ReadonlyArray<EventFlag>;
  flagGroup: ReadonlyArray<EventFlag>;
  onFlagChange: (flag: Flag) => void;
};

/**
 * Reusable component for displaying flag sections in both edit and view modes.
 * In edit/add mode, displays radio buttons for all flag options.
 * In view mode, displays badges for active flags only.
 *
 * @param mode - Current modal mode ("add", "edit", or "view")
 * @param title - Section title (used in view mode as form label)
 * @param fieldsetTitle - Section title for fieldset (used in edit/add mode, defaults to title)
 * @param flagOptions - Array of [flag, label] tuples for all available options
 * @param eventFlags - Currently selected event flags
 * @param flagGroup - Array of flags that belong to this section
 * @param onFlagChange - Callback when a flag is changed
 */
function FlagSection<Flag extends EventFlag | "none">({
  mode,
  title,
  fieldsetTitle,
  flagOptions,
  eventFlags,
  flagGroup,
  onFlagChange,
}: FlagSectionProps<Flag>) {
  if (mode !== "view") {
    // Edit/Add mode: Show all radio buttons
    return (
      <Col xs={12}>
        <fieldset className="border rounded p-3">
          <legend className="float-none w-auto px-2 fs-6">{fieldsetTitle || title}</legend>
          <Row className="g-2">
            {flagOptions.map(([flag, label]) => (
              <Col sm={6} lg={4} key={flag}>
                <FlagCheckbox
                  id={`${title.toLowerCase().replace(/\s+/g, "-")}-flag-${flag}`}
                  name={`${title.toLowerCase().replace(/\s+/g, "-")}-flag`}
                  type="radio"
                  label={label}
                  checked={
                    flag === "none"
                      ? !eventFlags.some((flagValue) => flagGroup.includes(flagValue))
                      : eventFlags.includes(flag as EventFlag)
                  }
                  onChange={() => onFlagChange(flag)}
                />
              </Col>
            ))}
          </Row>
        </fieldset>
      </Col>
    );
  }

  // View mode: Show only active flags as badges
  return (
    <Col xs={12}>
      <Form.Group>
        <Form.Label>{title}</Form.Label>
        <div className="d-flex gap-2 align-items-center">
          {eventFlags
            .filter((f) => flagGroup.includes(f))
            .map((flag) => (
              <Badge key={flag} bg="secondary">
                {getFlagLabel(flag)}
              </Badge>
            ))}
          {!eventFlags.some((f) => flagGroup.includes(f)) && (
            <span className="text-muted">{m.event_modal_none_label()}</span>
          )}
        </div>
      </Form.Group>
    </Col>
  );
}

type EventModalProps = {
  show: boolean;
  mode?: "add" | "edit" | "view";
  formRef: RefObject<HTMLDivElement | null>;
  eventType: "range" | "weekly";
  eventWeekday: number;
  eventStart: string;
  eventEnd: string;
  eventTitle: string;
  eventFlags: ReadonlyArray<EventFlag>;
  startDateError: string;
  endDateError: string;
  previewLine: string;
  typeFlagOptions: Array<[TypeFlag | "none", string]>;
  timeLocationFlagOptions: Array<[TimeLocationFlag | "none", string]>;
  typeFlagsAsEventFlags: ReadonlyArray<EventFlag>;
  timeLocationFlagsAsEventFlags: ReadonlyArray<EventFlag>;
  onHide: () => void;
  onEntered: () => void;
  onEventTypeChange: (value: "range" | "weekly") => void;
  onEventTitleChange: (value: string) => void;
  onEventWeekdayChange: (value: number) => void;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onTypeFlagChange: (flag: TypeFlag | "none") => void;
  onTimeFlagChange: (flag: TimeLocationFlag | "none") => void;
  onResetForm: () => void;
  onSubmit: () => void;
  onSwitchToEdit?: () => void;
  onCancelEditMode?: () => void;
};

/**
 * Render a controlled modal for creating or editing a calendar event.
 *
 * Displays a live preview, inputs for event type, title, date/weekday, and two sets of mutually
 * exclusive flags (type and time/location). Validation messages for start/end dates are surfaced
 * to assistive technologies via ARIA attributes.
 *
 * Accessibility Features:
 * - Modal.Header closeButton provides keyboard-accessible close (Escape key, X button)
 * - All form inputs have associated <Form.Label> elements for screen readers
 * - Required fields marked with aria-required="true" and visual * indicator
 * - Form validation errors use aria-describedby to link error messages to inputs
 * - Live preview section provides immediate feedback on event formatting
 * - Form.Check components (checkboxes/radios) have proper label associations
 * - Semantic HTML structure with proper heading hierarchy
 * - Focus trap built into React Bootstrap Modal component
 * - Modal backdrop click and Escape key both trigger onHide for flexibility
 *
 * @param show - Whether the modal is visible
 * @param mode - Modal mode: `"add"` for new events, `"edit"` for editing, `"view"` for read-only viewing
 * @param formRef - Ref attached to the modal body for focus management
 * @param eventType - Either `"range"` (start/end date) or `"weekly"` (weekday)
 * @param eventWeekday - Weekday number (1–7) when `eventType` is `"weekly"`
 * @param eventStart - Start date string in `YYYY/MM/DD` format when `eventType` is `"range"`
 * @param eventEnd - Optional end date string in `YYYY/MM/DD` format when `eventType` is `"range"`
 * @param eventTitle - Optional comment/title for the event
 * @param eventFlags - List of currently selected event flags
 * @param startDateError - Validation message for the start date, if any
 * @param endDateError - Validation message for the end date, if any
 * @param previewLine - Generated raw `.hday` line to display in the preview
 * @param typeFlagOptions - Pairs of type-flag key and label for the type flags fieldset
 * @param timeLocationFlagOptions - Pairs of time/location-flag key and label for that fieldset
 * @param typeFlagsAsEventFlags - Mapping of type-flag keys to event flag values
 * @param timeLocationFlagsAsEventFlags - Mapping of time/location-flag keys to event flag values
 * @param onHide - Called when the modal requests to be closed (backdrop click, Escape, or close button)
 * @param onEntered - Called after the modal has finished opening
 * @param onEventTypeChange - Handler for changes to the event type selector
 * @param onEventTitleChange - Handler for the event title input
 * @param onEventWeekdayChange - Handler for changes to the weekday selector
 * @param onStartDateChange - Handler for the start date input (receives `YYYY/MM/DD` or empty string)
 * @param onEndDateChange - Handler for the end date input (receives `YYYY/MM/DD` or empty string)
 * @param onTypeFlagChange - Handler invoked with a type-flag key when a type flag is selected
 * @param onTimeFlagChange - Handler invoked with a time/location-flag key when selected
 * @param onResetForm - Resets the form to its initial state
 * @param onSubmit - Submits the form to add or update the event
 * @param onSwitchToEdit - Optional callback when Edit button is clicked in view mode to switch to edit mode
 * @param onCancelEditMode - Optional callback used in edit mode to return to view mode without closing the modal
 * @returns The rendered EventModal component (a Bootstrap Modal containing the editor)
 */
export function EventModal({
  show,
  mode = "add",
  formRef,
  eventType,
  eventWeekday,
  eventStart,
  eventEnd,
  eventTitle,
  eventFlags,
  startDateError,
  endDateError,
  previewLine,
  typeFlagOptions,
  timeLocationFlagOptions,
  typeFlagsAsEventFlags,
  timeLocationFlagsAsEventFlags,
  onHide,
  onEntered,
  onEventTitleChange,
  onStartDateChange,
  onEndDateChange,
  onTypeFlagChange,
  onTimeFlagChange,
  onResetForm,
  onSubmit,
  onSwitchToEdit,
  onCancelEditMode,
}: EventModalProps) {
  return (
    <Modal show={show} onHide={onHide} onEntered={onEntered} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>
          {mode === "view"
            ? m.event_modal_view_event()
            : mode === "edit"
              ? m.event_modal_edit_event()
              : m.event_modal_new_event()}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body ref={formRef} tabIndex={-1}>
        <Form>
          <Row className="g-3">
            {mode !== "view" && (
              <Col xs={12}>
                <Card className="preview-card border-0 bg-body-secondary">
                  <Card.Body className="py-2">
                    <div className="small text-uppercase text-muted">{m.event_modal_preview_label()}</div>
                    <div className="fw-semibold">
                      {getEventTypeLabel(eventFlags)}{" "}
                      {eventType === "weekly"
                        ? eventWeekday
                          ? `· ${getWeekdayName(eventWeekday)}`
                          : ""
                        : eventStart
                          ? eventEnd && eventEnd !== eventStart
                            ? `· ${eventStart} → ${eventEnd}`
                            : `· ${eventStart}`
                          : m.event_modal_select_date()}
                    </div>
                    {eventTitle && <div className="text-muted">{eventTitle}</div>}
                    {eventFlags.length > 0 && (
                      <div className="text-muted small">
                        {m.event_modal_flags_label({ flags: eventFlags.map((flag) => getFlagLabel(flag)).join(", ") })}
                      </div>
                    )}
                    <div className="mt-2">
                      <div className="small text-uppercase text-muted">{m.event_modal_raw_line_label()}</div>
                      <div className="font-monospace">
                        {previewLine || m.event_modal_fill_required()}
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              </Col>
            )}
            <Col md={6}>
              <Form.Group controlId="eventType">
                <Form.Label>{m.event_modal_event_type_label()}</Form.Label>
                <Form.Control value={m.event_modal_type_range()} disabled readOnly />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group controlId="eventTitle">
                <Form.Label>{m.event_modal_comment_label()}</Form.Label>
                <Form.Control
                  aria-label={m.event_modal_comment_label()}
                  value={eventTitle}
                  onChange={(event) => onEventTitleChange(event.target.value)}
                  placeholder={m.event_modal_comment_placeholder()}
                  disabled={mode === "view"}
                />
              </Form.Group>
            </Col>

            <Col md={6}>
              <Form.Group controlId="eventStart">
                <Form.Label>
                  {m.event_modal_start_label()} <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  type="date"
                  value={eventStart ? eventStart.replace(/\//g, "-") : ""}
                  onChange={(event) =>
                    onStartDateChange(event.target.value ? event.target.value.replace(/-/g, "/") : "")
                  }
                  isInvalid={!!startDateError}
                  aria-required="true"
                  aria-describedby={startDateError ? "eventStart-error" : undefined}
                  disabled={mode === "view"}
                />
                {startDateError && (
                  <Form.Control.Feedback type="invalid" id="eventStart-error">
                    {startDateError}
                  </Form.Control.Feedback>
                )}
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group controlId="eventEnd">
                <Form.Label>{m.event_modal_end_label()}</Form.Label>
                <Form.Control
                  type="date"
                  value={eventEnd ? eventEnd.replace(/\//g, "-") : ""}
                  onChange={(event) =>
                    onEndDateChange(event.target.value ? event.target.value.replace(/-/g, "/") : "")
                  }
                  isInvalid={!!endDateError}
                  aria-describedby={endDateError ? "eventEnd-error" : undefined}
                  disabled={mode === "view"}
                />
                {endDateError && (
                  <Form.Control.Feedback type="invalid" id="eventEnd-error">
                    {endDateError}
                  </Form.Control.Feedback>
                )}
              </Form.Group>
            </Col>

            <FlagSection
              mode={mode}
              title={m.event_modal_type_section_title()}
              fieldsetTitle={m.event_modal_type_fieldset_title()}
              flagOptions={typeFlagOptions}
              eventFlags={eventFlags}
              flagGroup={typeFlagsAsEventFlags}
              onFlagChange={onTypeFlagChange}
            />

            <FlagSection
              mode={mode}
              title={m.event_modal_location_section_title()}
              fieldsetTitle={m.event_modal_location_fieldset_title()}
              flagOptions={timeLocationFlagOptions}
              eventFlags={eventFlags}
              flagGroup={timeLocationFlagsAsEventFlags}
              onFlagChange={onTimeFlagChange}
            />
          </Row>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        {mode === "view" ? (
          <>
            <Button variant="secondary" onClick={onHide}>
              {m.close()}
            </Button>
            {onSwitchToEdit && (
              <Button variant="primary" onClick={onSwitchToEdit}>
                {m.edit()}
              </Button>
            )}
          </>
        ) : (
          <>
            {mode === "edit" && onCancelEditMode && (
              <Button variant="secondary" onClick={onCancelEditMode}>
                {m.cancel()}
              </Button>
            )}
            <Button variant="outline-secondary" onClick={onResetForm}>
              {m.event_modal_reset_form()}
            </Button>
            <Button variant="primary" onClick={onSubmit}>
              {mode === "edit" ? m.event_modal_update_btn() : m.event_modal_add_btn()}
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
