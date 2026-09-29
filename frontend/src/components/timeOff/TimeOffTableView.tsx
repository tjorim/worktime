import clsx from "clsx";
import { useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import Card from "react-bootstrap/Card";
import Form from "react-bootstrap/Form";
import Table from "react-bootstrap/Table";
import type { SortingState } from "@tanstack/react-table";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import { EmptyState } from "@/components/shared/EmptyState";
import { SortableHeaderCell } from "@/components/shared/SortableHeaderCell";
import { TablePagination } from "@/components/shared/TablePagination";
import {
  createDataColumnHelper,
  DATA_TABLE_DEFAULT_PAGE_SIZE,
  useDataTable,
} from "@/hooks/useDataTable";
import {
  getEventColorClass,
  getEventTypeLabel,
  getTimeLocationSymbol,
} from "@/lib/hday/presentation";
import { getEntryFlagsForDisplay } from "@/lib/timeOff/codecs";
import {
  getTimeOffEntrySortKey,
  isTimeOffDateEntry,
  isTimeOffRangeEntry,
  isTimeOffWeeklyEntry,
} from "@/lib/timeOff/types";
import { TimeOffToolbar } from "./TimeOffToolbar";
import { TimeOffRawView } from "./TimeOffRawView";
import type { TimeOffViewMode } from "@/data/timeoffConstants";
import * as m from "@/paraglide/messages.js";

type TimeOffRow = {
  entry: TimeOffEntry;
  flags: ReturnType<typeof getEntryFlagsForDisplay>;
  typeLabel: string;
  title: string;
  dateSortKey: string;
  searchText: string;
};

const columnHelper = createDataColumnHelper<TimeOffRow>();

// Same order the data layer stores entries in, so the table opens unchanged.
const DEFAULT_SORTING: SortingState = [{ id: "date", desc: false }];

type TimeOffTableViewProps = {
  eventCount: number;
  selectedCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onBulkDelete: () => void;
  onImport: () => void;
  onExport: () => void;
  onPullFromHelper?: () => void;
  isPullingFromHelper: boolean;
  onPushToHelper?: () => void;
  isPushingToHelper: boolean;
  onAddEvent: () => void;
  viewMode: TimeOffViewMode;
  entries: TimeOffEntry[];
  selectedIds: Set<string>;
  onToggleSelection: (id: string) => void;
  onEditEvent: (id: string) => void;
  onDeleteEvent: (id: string) => void;
  /** Selects (or deselects) exactly these entries, leaving the rest of the selection untouched. */
  onSetSelection: (ids: string[], selected: boolean) => void;
  rawEditorText: string;
  rawEditorError?: string;
  rawEditorSkippedLines?: string[];
  isRawEditorDirty: boolean;
  onChangeRawEditorText: (value: string) => void;
  onApplyRawEditor: () => void;
  onResetRawEditor: () => void;
};

export function TimeOffTableView({
  eventCount,
  selectedCount,
  onSelectAll,
  onClearSelection,
  onBulkDelete,
  onImport,
  onExport,
  onPullFromHelper,
  isPullingFromHelper,
  onPushToHelper,
  isPushingToHelper,
  onAddEvent,
  viewMode,
  entries,
  selectedIds,
  onToggleSelection,
  onEditEvent,
  onDeleteEvent,
  onSetSelection,
  rawEditorText,
  rawEditorError,
  rawEditorSkippedLines,
  isRawEditorDirty,
  onChangeRawEditorText,
  onApplyRawEditor,
  onResetRawEditor,
}: TimeOffTableViewProps) {
  const [sorting, setSorting] = useState<SortingState>(DEFAULT_SORTING);
  const [search, setSearch] = useState("");

  const rows = useMemo<TimeOffRow[]>(
    () =>
      entries.map((entry) => {
        const flags = getEntryFlagsForDisplay(entry);
        const typeLabel = getEventTypeLabel(flags);
        const title = entry.note || typeLabel;
        return {
          entry,
          flags,
          typeLabel,
          title,
          dateSortKey: getTimeOffEntrySortKey(entry),
          // Newline-joined so a query can't match across two fields ("holiday" + "2026" ≈ "day 2").
          searchText: [
            typeLabel,
            entry.note ?? "",
            flags.join(" "),
            getEntryDisplayDateText(entry),
            getEntryIsoDateText(entry),
          ]
            .join("\n")
            .toLowerCase(),
        };
      }),
    [entries],
  );

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "select",
          enableSorting: false,
          header: () => null,
          cell: () => null,
        }),
        columnHelper.accessor("typeLabel", {
          id: "type",
          header: () => m.timeoff_col_type(),
          sortFn: "text",
        }),
        columnHelper.accessor("dateSortKey", {
          id: "date",
          header: () => m.timeoff_col_date_pattern(),
          sortFn: "basic",
        }),
        columnHelper.accessor((row) => row.entry.note ?? "", {
          id: "title",
          header: () => m.timeoff_col_title(),
          sortFn: "text",
        }),
        columnHelper.accessor((row) => row.flags.join(", "), {
          id: "flags",
          header: () => m.timeoff_col_flags(),
          sortFn: "text",
        }),
        columnHelper.display({
          id: "actions",
          enableSorting: false,
          header: () => m.timeoff_col_actions(),
          cell: () => null,
        }),
      ]),
    [],
  );

  const table = useDataTable(
    {
      data: rows,
      columns,
      state: { sorting, globalFilter: search },
      initialState: { pagination: { pageIndex: 0, pageSize: DATA_TABLE_DEFAULT_PAGE_SIZE } },
      getRowId: (row) => row.entry.id,
      onSortingChange: setSorting,
      onGlobalFilterChange: setSearch,
      globalFilterFn: (row, _columnId, filterValue) => {
        const needle = String(filterValue).trim().toLowerCase();
        return !needle || row.original.searchText.includes(needle);
      },
    },
    (state) => ({
      sorting: state.sorting,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
    }),
  );

  const visibleRows = table.getRowModel().rows;
  const visibleIds = visibleRows.map((row) => row.original.entry.id);
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const isFiltering = search.trim() !== "";

  return (
    <>
      <Card>
        <TimeOffToolbar
          eventCount={eventCount}
          selectedCount={selectedCount}
          onSelectAll={onSelectAll}
          onClearSelection={onClearSelection}
          onBulkDelete={onBulkDelete}
          onImport={onImport}
          onExport={onExport}
          onPullFromHelper={onPullFromHelper}
          isPullingFromHelper={isPullingFromHelper}
          onPushToHelper={onPushToHelper}
          isPushingToHelper={isPushingToHelper}
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
            <>
              <Form.Control
                type="search"
                size="sm"
                className="mb-3"
                style={{ maxWidth: "320px" }}
                placeholder={m.timeoff_search_placeholder()}
                aria-label={m.timeoff_search_aria()}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {visibleRows.length === 0 && isFiltering ? (
                <EmptyState
                  icon="bi-search"
                  title={m.timeoff_no_results_title()}
                  description={m.timeoff_no_results_desc()}
                />
              ) : (
                <Table responsive hover>
                  <thead>
                    {table.getHeaderGroups().map((headerGroup) => (
                      <tr key={headerGroup.id}>
                        {headerGroup.headers.map((header) => {
                          if (header.column.id === "select") {
                            return (
                              <th key={header.id} scope="col">
                                <input
                                  ref={(element) => {
                                    if (element) {
                                      element.indeterminate =
                                        selectedVisibleCount > 0 && !allVisibleSelected;
                                    }
                                  }}
                                  type="checkbox"
                                  className="form-check-input"
                                  aria-label={m.timeoff_select_all_events_aria()}
                                  checked={allVisibleSelected}
                                  onChange={(event) =>
                                    onSetSelection(visibleIds, event.target.checked)
                                  }
                                />
                              </th>
                            );
                          }

                          return <SortableHeaderCell key={header.id} header={header} />;
                        })}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {visibleRows.map((tableRow) => {
                      const { entry, flags, title, typeLabel } = tableRow.original;
                      const eventColorClass = getEventColorClass(
                        flags,
                        isTimeOffWeeklyEntry(entry) ? "weekly" : "range",
                      );
                      const symbol = getTimeLocationSymbol(flags);

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
                              {typeLabel}
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
              <TablePagination
                total={table.getPrePaginatedRowModel().rows.length}
                pageIndex={table.state.pagination.pageIndex}
                pageSize={table.state.pagination.pageSize}
                canPreviousPage={table.getCanPreviousPage()}
                canNextPage={table.getCanNextPage()}
                onPreviousPage={() => table.previousPage()}
                onNextPage={() => table.nextPage()}
                onPageSizeChange={(size) => table.setPageSize(size)}
              />
            </>
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

const WEEKDAY_MESSAGES = [
  m.weekday_mon,
  m.weekday_tue,
  m.weekday_wed,
  m.weekday_thu,
  m.weekday_fri,
  m.weekday_sat,
  m.weekday_sun,
] as const;

function getEntryDisplayDateText(entry: TimeOffEntry): string {
  if (isTimeOffWeeklyEntry(entry)) {
    const weekdayMsg = WEEKDAY_MESSAGES[entry.weekday - 1];
    return weekdayMsg ? m.timeoff_every_weekday({ day: weekdayMsg() }) : "";
  }
  if (isTimeOffRangeEntry(entry)) {
    return entry.start === entry.end
      ? toDisplayDate(entry.start)
      : `${toDisplayDate(entry.start)} - ${toDisplayDate(entry.end)}`;
  }
  return toDisplayDate(entry.date);
}

/** ISO form of the dates, so searching "2026-01" works as well as "2026/01". */
function getEntryIsoDateText(entry: TimeOffEntry): string {
  if (isTimeOffWeeklyEntry(entry)) return "";
  if (isTimeOffRangeEntry(entry)) return `${entry.start} ${entry.end}`;
  return entry.date;
}

function renderEntryDisplayDate(entry: TimeOffEntry) {
  if (isTimeOffWeeklyEntry(entry)) {
    const weekdayMsg = WEEKDAY_MESSAGES[entry.weekday - 1];
    return weekdayMsg ? m.timeoff_every_weekday({ day: weekdayMsg() }) : "↻ —";
  }

  if (isTimeOffRangeEntry(entry)) {
    if (entry.start === entry.end) {
      return <span>{toDisplayDate(entry.start)}</span>;
    }
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
