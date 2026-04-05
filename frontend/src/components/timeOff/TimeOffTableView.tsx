import clsx from "clsx";
import { useEffect, useRef } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { EmptyState } from "../shared/EmptyState";
import { getEventColorClass, getEventTypeLabel, getTimeLocationSymbol } from "@/lib/hday/presentation";
import { getEntryFlagsForDisplay } from "@/lib/timeOff/codecs";
import { TimeOffToolbar } from "./TimeOffToolbar";
import { TimeOffRawView } from "./TimeOffRawView";
import type { TimeOffViewMode } from "../../data/timeoffConstants";
import * as m from "../../paraglide/messages.js";

/**
 * Weekday names for display (Monday through Sunday, ISO weekday 1-7).
 * Hoisted to module scope to avoid repeated allocations on each render.
 */
/**
 * Generate a unique key for an event table row from its index and properties.
 */
function getEntryRowKey(entry: TimeOffEntry): string {
  return `${entry.id}-${entry.date}`;
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
  entries: TimeOffEntry[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onEditEntry: (id: string) => void;
  onDeleteEntry: (id: string) => void;
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
  entries,
  selectedIds,
  onToggleSelection,
  onEditEntry,
  onDeleteEntry,
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
      const isIndeterminate = selectedIds.size > 0 && selectedIds.size < entries.length;
      selectAllRef.current.indeterminate = isIndeterminate;
    }
  }, [selectedIds, entries.length]);

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
          {entries.length === 0 ? (
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
                      checked={entries.length > 0 && selectedIds.size === entries.length}
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
                {entries.map((entry) => {
                  const entryFlags = getEntryFlagsForDisplay(entry);
                  const eventColorClass = getEventColorClass(entryFlags, "range");
                  const eventLabel = getEventTypeLabel(entryFlags);
                  const symbol = getTimeLocationSymbol(entryFlags);

                  return (
                    <tr key={getEntryRowKey(entry)}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={m.timeoff_select_event_aria({
                            name: entry.note || eventLabel,
                          })}
                          checked={selectedIds.has(entry.id)}
                          onChange={() => onToggleSelection(entry.id)}
                        />
                      </td>
                      <td>
                        <span className={clsx("badge", "event-type-badge", eventColorClass)}>
                          {symbol && `${symbol} `}
                          {eventLabel}
                        </span>
                      </td>
                      <td>{entry.date}</td>
                      <td>{entry.note || <span className="text-muted">—</span>}</td>
                      <td>
                        {entryFlags.length ? (
                          <span className="text-muted small">{entryFlags.join(", ")}</span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td>
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          onClick={() => onEditEntry(entry.id)}
                          className="me-2"
                          aria-label={m.edit_with_name({ name: entry.note || eventLabel })}
                        >
                          <i className="bi bi-pencil" aria-hidden="true"></i>
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => onDeleteEntry(entry.id)}
                          aria-label={m.delete_with_name({ name: entry.note || eventLabel })}
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
