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
import * as m from "../../paraglide/messages.js";

/**
 * Weekday names for display (Monday through Sunday, ISO weekday 1-7).
 * Hoisted to module scope to avoid repeated allocations on each render.
 */
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
function formatEventDate(event: HdayEvent, weekdayNames: string[]): React.ReactNode {
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
        ? weekdayNames[event.weekday - 1]
        : m.timeoff_unknown_format();
    return m.timeoff_every_weekday({ day: weekdayName ?? m.timeoff_unknown_format() });
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
  onExport: () => void;
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
  onExport,
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

  const weekdayNames = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, index + 1));
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  });

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
          onExport={onExport}
          onAddEvent={onAddEvent}
          viewMode={viewMode}
        />
        <Card.Body>
          {events.length === 0 ? (
            <EmptyState
              icon="bi-calendar-x"
              title={m.timeoff_no_events_title()}
              description={m.timeoff_no_events_desc()}
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
                      aria-label={m.timeoff_select_all_events_aria()}
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
                  <th scope="col">{m.timeoff_col_type()}</th>
                  <th scope="col">{m.timeoff_col_date_pattern()}</th>
                  <th scope="col">{m.timeoff_col_title()}</th>
                  <th scope="col">{m.timeoff_col_flags()}</th>
                  <th scope="col">{m.timeoff_col_actions()}</th>
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
                          aria-label={m.timeoff_select_event_aria({ name: event.title || eventLabel })}
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
                        {formatEventDate(event, weekdayNames)}
                        {event.type === "unknown" && (
                          <>
                            <span className="text-muted">{m.timeoff_unknown_format()}</span>
                            <span id={unknownDescriptionId} className="visually-hidden">
                              {m.timeoff_unknown_format_help()}
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
                              aria-label={m.edit_with_name({ name: event.title || eventLabel })}
                            >
                              <i className="bi bi-pencil" aria-hidden="true"></i>
                            </Button>
                            <Button
                              variant="outline-danger"
                              size="sm"
                              onClick={() => onDeleteEvent(index)}
                              aria-label={m.delete_with_name({ name: event.title || eventLabel })}
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
