import clsx from "clsx";
import { useEffect, useRef } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Table from "react-bootstrap/Table";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { EmptyState } from "../shared/EmptyState";
import { getEventColorClass, getEventTypeLabel, getTimeLocationSymbol } from "@/lib/hday/presentation";
import { getEntryFlagsForDisplay } from "@/lib/timeOff/codecs";
import { isTimeOffDateEntry, isTimeOffRangeEntry, isTimeOffWeeklyEntry } from "@/lib/timeOff/types";
import { TimeOffToolbar } from "./TimeOffToolbar";
import { TimeOffRawView } from "./TimeOffRawView";
import type { TimeOffViewMode } from "../../data/timeoffConstants";
import * as m from "../../paraglide/messages.js";

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
  onEditEvent: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  rawEditorText: string;
  rawEditorError?: string;
  rawEditorSkippedLines?: string[];
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
  onEditEvent,
  onDeleteEvent,
  rawEditorText,
  rawEditorError,
  rawEditorSkippedLines,
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
  }, [entries.length, selectedIds]);

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
                  const flags = getEntryFlagsForDisplay(entry);
                  const eventColorClass = getEventColorClass(
                    flags,
                    isTimeOffWeeklyEntry(entry) ? "weekly" : "range",
                  );
                  const eventLabel = getEventTypeLabel(flags);
                  const symbol = getTimeLocationSymbol(flags);
                  const title = entry.note || eventLabel;

                  return (
                    <tr key={entry.id}>
                      <td>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          aria-label={m.timeoff_select_event_aria({ name: title })}
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
                      <td>{renderEntryDisplayDate(entry)}</td>
                      <td>{entry.note || <span className="text-muted">—</span>}</td>
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
                          onClick={() => onEditEvent(entry.id)}
                          className="me-2"
                          aria-label={m.edit_with_name({ name: title })}
                        >
                          <i className="bi bi-pencil" aria-hidden="true"></i>
                        </Button>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => onDeleteEvent(entry.id)}
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
        skippedLines={rawEditorSkippedLines}
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

const WEEKDAY_MESSAGES = [m.weekday_mon, m.weekday_tue, m.weekday_wed, m.weekday_thu, m.weekday_fri, m.weekday_sat, m.weekday_sun] as const;

function renderEntryDisplayDate(entry: TimeOffEntry) {
  if (isTimeOffWeeklyEntry(entry)) {
    const weekdayMsg = WEEKDAY_MESSAGES[entry.weekday - 1];
    return weekdayMsg ? m.timeoff_every_weekday({ day: weekdayMsg() }) : "↻ —";
  }

  if (isTimeOffRangeEntry(entry)) {
    return (
      <>
        <span>{toDisplayDate(entry.start)}</span>
        {" - "}
        <span>{toDisplayDate(entry.end)}</span>
      </>
    );
  }

  return isTimeOffDateEntry(entry) ? toDisplayDate(entry.date) : "";
}
