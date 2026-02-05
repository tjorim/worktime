import clsx from "clsx";
import Button from "react-bootstrap/Button";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Popover from "react-bootstrap/Popover";

/**
 * Legend items for event type colors.
 * Maps CSS class suffixes to human-readable labels.
 */
const EVENT_TYPE_LEGEND = [
  { colorClass: "event-holiday-full", label: "Holiday" },
  { colorClass: "event-business-full", label: "Business" },
  { colorClass: "event-course-full", label: "Course" },
  { colorClass: "event-in-full", label: "In Office" },
  { colorClass: "event-weekend-full", label: "Day Off" },
  { colorClass: "event-birthday-full", label: "Birthday" },
  { colorClass: "event-ill-full", label: "Sick Leave" },
  { colorClass: "event-other-full", label: "Other" },
] as const;

/**
 * Legend items for day indicators (emojis shown in calendar headers).
 */
const INDICATOR_LEGEND = [
  { emoji: "🎉", label: "Public Holiday" },
  { emoji: "🏫", label: "School Holiday" },
  { emoji: "💶", label: "Payday" },
  { emoji: "📘", label: "Course/Training" },
] as const;

const legendPopover = (
  <Popover id="calendar-legend-popover">
    <Popover.Header as="h3">Legend</Popover.Header>
    <Popover.Body>
      <div className="mb-2">
        <strong className="small">Event Types</strong>
        <div className="d-flex flex-wrap gap-2 mt-1">
          {EVENT_TYPE_LEGEND.map(({ colorClass, label }) => (
            <span key={colorClass} className="d-inline-flex align-items-center gap-1">
              <span className={clsx("month-calendar-event-color", colorClass)} />
              <small>{label}</small>
            </span>
          ))}
        </div>
      </div>
      <div>
        <strong className="small">Day Indicators</strong>
        <div className="d-flex flex-wrap gap-2 mt-1">
          {INDICATOR_LEGEND.map(({ emoji, label }) => (
            <span key={emoji} className="d-inline-flex align-items-center gap-1">
              <span className="calendar-legend-emoji">{emoji}</span>
              <small>{label}</small>
            </span>
          ))}
        </div>
      </div>
    </Popover.Body>
  </Popover>
);

/**
 * CalendarLegend displays a popover legend explaining event colors and indicators.
 *
 * Shows:
 * - Event type color dots with labels
 * - Day indicator emojis with explanations
 */
export function CalendarLegend() {
  return (
    <OverlayTrigger trigger="click" placement="left-end" overlay={legendPopover} rootClose>
      <Button variant="link" size="sm" className="text-muted p-0 text-decoration-none">
        <i className="bi bi-info-circle me-1" aria-hidden="true"></i>
        Legend
      </Button>
    </OverlayTrigger>
  );
}
