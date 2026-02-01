import Button from "react-bootstrap/Button";
import Table from "react-bootstrap/Table";
import type { HdayEvent } from "../../lib/hday/types";
import {
  getEventColorClass,
  getEventTypeLabel,
  getTimeLocationSymbol,
} from "../../lib/hday/parser";

/**
 * Generate a unique key for an event table row.
 */
function getEventRowKey(event: HdayEvent, index: number): string {
  if (event.type === "range") {
    return `range-${index}-${event.start ?? "unknown"}-${event.end ?? "unknown"}-${event.title ?? ""}`;
  }
  if (event.type === "weekly") {
    return `weekly-${index}-${event.weekday ?? "unknown"}-${event.title ?? ""}`;
  }
  return `unknown-${index}-${event.raw ?? ""}`;
}

/**
 * Format the date/pattern column for an event.
 */
function formatEventDate(event: HdayEvent): React.ReactNode {
  if (event.type === "range") {
    return (
      <>
        {event.start}
        {event.end && event.end !== event.start && ` → ${event.end}`}
      </>
    );
  }
  if (event.type === "weekly") {
    const weekdayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const weekdayName =
      event.weekday !== undefined && event.weekday >= 1 && event.weekday <= 7
        ? weekdayNames[event.weekday - 1]
        : "Unknown";
    return `Every ${weekdayName}`;
  }
  return null;
}

type EventTableProps = {
  events: HdayEvent[];
  selectedIndices: number[];
  onToggleSelection: (index: number) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onEditEvent: (index: number) => void;
  onDeleteEvent: (index: number) => void;
};

/**
 * Render the events table with selection checkboxes and action buttons.
 *
 * Accessibility Features:
 * - Semantic table structure with proper thead/tbody for screen readers
 * - ARIA labels on icon-only buttons (Edit/Delete) for screen reader announcements
 * - aria-hidden on decorative icons to prevent redundant announcements
 * - Checkbox controls for multi-select with proper labels
 * - Event type badges with accessible color contrast
 */
export function EventTable({
  events,
  selectedIndices,
  onToggleSelection,
  onSelectAll,
  onClearSelection,
  onEditEvent,
  onDeleteEvent,
}: EventTableProps) {
  return (
    <Table responsive hover>
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              aria-label="Select all events"
              checked={events.length > 0 && selectedIndices.length === events.length}
              onChange={(event) => {
                if (event.target.checked) {
                  onSelectAll();
                } else {
                  onClearSelection();
                }
              }}
            />
          </th>
          <th>Type</th>
          <th>Date / Pattern</th>
          <th>Title</th>
          <th>Flags</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {events.map((event, index) => {
          const eventColorClass =
            event.type !== "unknown" ? getEventColorClass(event.flags) : "event-unknown";
          const eventLabel =
            event.type !== "unknown" ? getEventTypeLabel(event.flags) : "Unknown";
          const symbol = event.type !== "unknown" ? getTimeLocationSymbol(event.flags) : "";

          const unknownDescriptionId =
            event.type === "unknown" ? `unknown-event-${index}` : undefined;

          return (
            <tr key={getEventRowKey(event, index)} aria-describedby={unknownDescriptionId}>
              <td>
                <input
                  type="checkbox"
                  aria-label={`Select ${event.title || eventLabel}`}
                  checked={selectedIndices.includes(index)}
                  onChange={() => onToggleSelection(index)}
                />
              </td>
              <td>
                <span className={`badge event-type-badge ${eventColorClass}`}>
                  {symbol && `${symbol} `}
                  {eventLabel}
                </span>
              </td>
              <td>
                {formatEventDate(event)}
                {event.type === "unknown" && (
                  <>
                    <span className="text-muted">Unknown format</span>
                    <span id={unknownDescriptionId} className="visually-hidden">
                      Unknown event format. Remove or re-import this entry to resolve the issue.
                    </span>
                  </>
                )}
              </td>
              <td>{event.title || <span className="text-muted">—</span>}</td>
              <td>
                {event.flags && event.flags.length > 0 ? (
                  <span className="text-muted small">{event.flags.join(", ")}</span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td>
                {event.type !== "unknown" && (
                  <>
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => onEditEvent(index)}
                      className="me-2"
                      aria-label={`Edit ${event.title || eventLabel}`}
                    >
                      <i className="bi bi-pencil" aria-hidden="true"></i>
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => onDeleteEvent(index)}
                      aria-label={`Delete ${event.title || eventLabel}`}
                    >
                      <i className="bi bi-trash" aria-hidden="true"></i>
                    </Button>
                  </>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </Table>
  );
}
