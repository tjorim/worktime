import clsx from "clsx";
import { useEffect, useRef } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import type { HdayEvent } from "../../lib/hday/types";
import { EmptyState } from "../shared/EmptyState";
import {
  getEventColorClass,
  getEventTypeLabel,
  getTimeLocationSymbol,
} from "../../lib/hday/parser";
import { TimeOffToolbar } from "./TimeOffToolbar";
import { TimeOffRawView } from "./TimeOffRawView";
import { Weekday } from "../../data/timeoffConstants";
import type { TimeOffViewMode } from "../../data/timeoffConstants";

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

type TimeOffTableViewProps = {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  eventCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onImport: () => void;
  onExportYear: (year: number | "all") => void;
  availableYears: number[];
  onAddEvent: () => void;
  viewMode: TimeOffViewMode;
  events: HdayEvent[];
  selectedIndices: Set<number>;
  onToggleSelection: (index: number) => void;
  onEditEvent: (index: number) => void;
  onDeleteEvent: (index: number) => void;
  // Raw editor props
  rawEditorText: string;
  rawEditorError?: string;
  isRawEditorDirty: boolean;
  onChangeRawEditorText: (value: string) => void;
  onApplyRawEditor: () => void;
  onResetRawEditor: () => void;
};

export function TimeOffTableView({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  eventCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onImport,
  onExportYear,
  availableYears,
  onAddEvent,
  viewMode,
  events,
  selectedIndices,
  onToggleSelection,
  onEditEvent,
  onDeleteEvent,
  rawEditorText,
  rawEditorError,
  isRawEditorDirty,
  onChangeRawEditorText,
  onApplyRawEditor,
  onResetRawEditor,
}: TimeOffTableViewProps) {
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      const isIndeterminate = selectedIndices.size > 0 && selectedIndices.size < events.length;
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedIndices, events.length]);

  return (
    <>
      <Card>
        <TimeOffToolbar
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={onUndo}
          onRedo={onRedo}
          eventCount={eventCount}
          selectedCount={selectedCount}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onBulkDelete={onBulkDelete}
          onImport={onImport}
          onExportYear={onExportYear}
          availableYears={availableYears}
          onAddEvent={onAddEvent}
          viewMode={viewMode}
        />
        <Card.Body>
          {events.length === 0 ? (
            <EmptyState
              icon="bi-calendar-x"
              title="No time-off events yet"
              description={
                'Click "Add Event" to create your first event, or "Import" to load an existing .hday file.'
              }
            />
          ) : (
            <Table responsive hover>
              <thead>
                <tr>
                  <th scope="col">
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
                  <th scope="col">Type</th>
                  <th scope="col">Date / Pattern</th>
                  <th scope="col">Title</th>
                  <th scope="col">Flags</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event, index) => {
                  const eventColorClass =
                    event.type !== "unknown"
                      ? getEventColorClass(event.flags, event.type)
                      : "event-unknown";
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
                              Unknown event format. Remove or re-import this entry to resolve the
                              issue.
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
          )}
        </Card.Body>
      </Card>

      {/* Raw .hday Editor */}
      <TimeOffRawView
        rawText={rawEditorText}
        error={rawEditorError}
        isDirty={isRawEditorDirty}
        onChangeRawText={onChangeRawEditorText}
        onApply={onApplyRawEditor}
        onReset={onResetRawEditor}
      />
    </>
  );
}
