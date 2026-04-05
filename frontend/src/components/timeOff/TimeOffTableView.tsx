import clsx from "clsx";
import { useEffect, useRef } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import type { HdayEvent } from "@/lib/hday/types";
import { EmptyState } from "../shared/EmptyState";
import { getEventColorClass, getEventTypeLabel, getTimeLocationSymbol } from "@/lib/hday/presentation";
import { TimeOffToolbar } from "./TimeOffToolbar";
import { TimeOffRawView } from "./TimeOffRawView";
import type { TimeOffViewMode } from "../../data/timeoffConstants";
import * as m from "../../paraglide/messages.js";

function getEventRowKey(event: HdayEvent, index: number): string {
  return event.type === "weekly"
    ? `weekly-${event.weekday ?? 0}-${event.title ?? ""}-${index}`
    : `range-${event.start ?? ""}-${event.end ?? ""}-${event.title ?? ""}-${index}`;
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
  selectedIds: Set<number>;
  onToggleSelection: (index: number) => void;
  onEditEvent: (index: number) => void;
  onDeleteEvent: (index: number) => void;
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
  selectedIds,
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
      const isIndeterminate = selectedIds.size > 0 && selectedIds.size < events.length;
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [events.length, selectedIds]);

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
                      checked={events.length > 0 && selectedIds.size === events.length}
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
                  const flags = event.flags ?? [];
                  const eventColorClass = getEventColorClass(flags, event.type);
                  const eventLabel = getEventTypeLabel(flags);
                  const symbol = getTimeLocationSymbol(flags);
                  const title = event.title || eventLabel;

                  return (
                    <tr key={getEventRowKey(event, index)}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={m.timeoff_select_event_aria({ name: title })}
                          checked={selectedIds.has(index)}
                          onChange={() => onToggleSelection(index)}
                        />
                      </td>
                      <td>
                        <span className={clsx("badge", "event-type-badge", eventColorClass)}>
                          {symbol && `${symbol} `}
                          {eventLabel}
                        </span>
                      </td>
                      <td>{renderEventDisplayDate(event)}</td>
                      <td>{event.title || <span className="text-muted">—</span>}</td>
                      <td>
                        {flags.length ? (
                          <span className="text-muted small">{flags.join(", ")}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => onEditEvent(index)}
                          className="me-2"
                          aria-label={m.edit_with_name({ name: title })}
                        >
                          <i className="bi bi-pencil" aria-hidden="true"></i>
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => onDeleteEvent(index)}
                          aria-label={m.delete_with_name({ name: title })}
                        >
                          <i className="bi bi-trash" aria-hidden="true"></i>
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>

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

function toDisplayDate(value: string): string {
  return value.replace(/-/g, "/");
}

function renderEventDisplayDate(event: HdayEvent) {
  if (event.type === "weekly") {
    return `Every ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][(event.weekday ?? 1) - 1]}`;
  }

  if (event.start && event.end && event.end !== event.start) {
    return (
      <>
        <span>{toDisplayDate(event.start)}</span>
        {" - "}
        <span>{toDisplayDate(event.end)}</span>
      </>
    );
  }

  return event.start ? toDisplayDate(event.start) : "";
}
