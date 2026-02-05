import clsx from "clsx";
import { useEffect, useRef } from "react";
import Button from "react-bootstrap/Button";
import Table from "react-bootstrap/Table";
import type { HdayEvent } from "../../lib/hday/types";
import {
  getEventColorClass,
  getEventTypeLabel,
  getTimeLocationSymbol,
} from "../../lib/hday/parser";
import { Weekday } from "../../data/timeoffConstants";

/**
 * Weekday names for display (Monday through Sunday, ISO weekday 1-7).
 * Hoisted to module scope to avoid repeated allocations on each render.
 */
const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/**
 * Generate a unique key for an event table row from its index and properties.
 */
function getEventRowKey(event: HdayEvent, index: number): string {
  if (event.type === "range") {
    return `${index}-range-${event.start ?? "unknown"}-${event.end ?? "unknown"}-${event.title ?? ""}`;
  }
  if (event.type === "weekly") {
    return `${index}-weekly-${event.weekday ?? "unknown"}-${event.title ?? ""}`;
  }
  return `${index}-unknown-${event.title ?? ""}`;
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
    const weekdayName =
      event.weekday !== undefined &&
      event.weekday >= Weekday.Monday &&
      event.weekday <= Weekday.Sunday
        ? WEEKDAY_NAMES[event.weekday - 1]
        : "Unknown";
    return `Every ${weekdayName}`;
  }
  return null;
}

type EventTableProps = {
  events: HdayEvent[];
  selectedIndices: Set<number>;
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
  const selectAllRef = useRef<HTMLInputElement>(null);

  // Update indeterminate state for select-all checkbox when selection changes
  useEffect(() => {
    if (selectAllRef.current) {
      const isIndeterminate = selectedIndices.size > 0 && selectedIndices.size < events.length;
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedIndices, events.length]);

  return (
    <>
      {events.length === 0 && (
        <div role="status" aria-live="polite" className="text-center text-muted py-4">
          <i className="bi bi-inbox d-block mb-2" style={{ fontSize: "2rem" }}></i>
          <span>No events found</span>
        </div>
      )}
      <Table responsive hover>
        <thead>
          <tr>
            <th>
              <input
                ref={selectAllRef}
                type="checkbox"
                className="form-check-input"
                aria-label="Select all events"
                checked={events.length > 0 && selectedIndices.size === events.length}
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
                    className="form-check-input"
                    aria-label={`Select ${event.title || eventLabel}`}
                    checked={selectedIndices.has(index)}
                    onChange={() => onToggleSelection(index)}
                  />
                </td>
                <td>
                  <span className={clsx("badge", "event-type-badge", eventColorClass)}>
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
                  {event.flags?.length ? (
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
    </>
  );
}
