import { useMemo, useState } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";
import Table from "react-bootstrap/Table";
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  flexRender,
  globalFilteringFeature,
  metaHelper,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  type ColumnVisibilityState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import { useToast } from "@/contexts/ToastContext";
import { aggregateLocationCounts } from "@/utils/workLocationUtils";
import type { WorkLocationMap } from "@/types/workLocation";
import { WORK_LOCATION_ICON_CLASS } from "./workLocationConstants";
import * as m from "@/paraglide/messages.js";
import { getLocale } from "@/paraglide/runtime.js";

interface LocationYearSummaryProps {
  year: number;
  workLocationMap: WorkLocationMap;
}

type LocationSummaryRow = {
  location: "home" | "office" | "other";
  locationLabel: string;
  countryCode: string;
  days: number;
  percentage: number;
};

type LocationSummaryColumnMeta = {
  align?: "end";
};

const locationSummaryTableFeatures = tableFeatures({
  columnVisibilityFeature,
  columnFilteringFeature,
  columnMeta: metaHelper<LocationSummaryColumnMeta>(),
  globalFilteringFeature,
  rowSortingFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  sortFns: {
    alphanumeric: sortFn_alphanumeric,
    basic: sortFn_basic,
    text: sortFn_text,
  },
});
const locationSummaryColumnHelper = createColumnHelper<
  typeof locationSummaryTableFeatures,
  LocationSummaryRow
>();

/**
 * Renders an annual work location summary grouped by (location, country, label).
 * Intended for tax return submission — includes a "Copy to clipboard" button.
 *
 * Only entries for the given year are included.
 */
export function LocationYearSummary({ year, workLocationMap }: LocationYearSummaryProps) {
  const toast = useToast();

  // Filter the map to only the requested year
  const yearMap: WorkLocationMap = useMemo(() => {
    const yearPrefix = `${year}-`;
    const filtered: WorkLocationMap = new Map();
    for (const [key, value] of workLocationMap.entries()) {
      if (key.startsWith(yearPrefix)) {
        filtered.set(key, value);
      }
    }
    return filtered;
  }, [workLocationMap, year]);

  const locale = getLocale();
  const summaryRows = useMemo(() => aggregateLocationCounts(yearMap), [yearMap]);
  const totalDays = useMemo(() => summaryRows.reduce((sum, r) => sum + r.days, 0), [summaryRows]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "days", desc: true }]);
  const [countryFilter, setCountryFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState<ColumnVisibilityState>({});

  const rows = useMemo<LocationSummaryRow[]>(
    () =>
      summaryRows.map((row) => ({
        ...row,
        locationLabel:
          row.location === "home"
            ? m.work_location_home({}, { locale })
            : row.location === "office"
              ? m.work_location_office({}, { locale })
              : m.work_location_other({}, { locale }),
        percentage: totalDays > 0 ? Math.round((row.days / totalDays) * 100) : 0,
      })),
    [summaryRows, totalDays, locale],
  );

  const columns = useMemo(
    () =>
      locationSummaryColumnHelper.columns([
        locationSummaryColumnHelper.accessor("locationLabel", {
          header: m.location_col_location({}, { locale }),
          cell: (context) => (
            <>
              <i
                className={`bi ${WORK_LOCATION_ICON_CLASS[context.row.original.location]} me-1`}
                aria-hidden="true"
              ></i>
              {context.getValue()}
            </>
          ),
        }),
        locationSummaryColumnHelper.accessor("countryCode", {
          header: m.location_col_country({}, { locale }),
        }),
        locationSummaryColumnHelper.accessor("days", {
          header: m.location_col_days({}, { locale }),
          meta: { align: "end" } satisfies LocationSummaryColumnMeta,
          cell: (context) => <span className="text-end d-block">{context.getValue()}</span>,
        }),
        locationSummaryColumnHelper.accessor("percentage", {
          header: "%",
          meta: { align: "end" } satisfies LocationSummaryColumnMeta,
          cell: (context) => (
            <span className="text-end text-muted d-block">{context.getValue()}%</span>
          ),
        }),
      ]),
    [locale],
  );

  const table = useTable({
    features: locationSummaryTableFeatures,
    data: rows,
    columns,
    state: {
      sorting,
      columnVisibility,
      globalFilter: countryFilter,
    },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onGlobalFilterChange: setCountryFilter,
    globalFilterFn: (row, _columnId, filterValue) => {
      const normalizedFilter = String(filterValue).trim().toLowerCase();
      if (!normalizedFilter) {
        return true;
      }
      return (
        row.original.countryCode.toLowerCase().includes(normalizedFilter) ||
        row.original.locationLabel.toLowerCase().includes(normalizedFilter)
      );
    },
  });

  const handleCopy = () => {
    if (!navigator?.clipboard) {
      toast.showError(m.location_clipboard_unavailable());
      return;
    }

    const header = m.location_clipboard_header({ year });
    const divider = "-".repeat(header.length);
    const lines = [
      header,
      divider,
      ...table.getRowModel().rows.map((tableRow) => {
        const row = tableRow.original;
        const locationLabel = row.locationLabel;
        const pluralCategory = new Intl.PluralRules(getLocale()).select(row.days);
        const dayLabel =
          pluralCategory === "one"
            ? m.location_days_count({ count: row.days })
            : m.location_days_count_plural({ count: row.days });
        return `${locationLabel.padEnd(8)} ${row.countryCode.padEnd(20)} ${dayLabel} (${row.percentage}%)`;
      }),
    ];

    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.showSuccess(m.location_copied()))
      .catch(() => toast.showError(m.location_copy_failed()));
  };

  if (rows.length === 0) {
    return <div className="text-muted small fst-italic py-2">{m.location_no_data({ year })}</div>;
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="fw-semibold small">
          <i className="bi bi-list-columns me-1" aria-hidden="true"></i>
          {m.location_summary_title({ year })}
        </span>
        <Button
          size="sm"
          variant="outline-secondary"
          onClick={handleCopy}
          aria-label={m.location_copy_aria()}
        >
          <i className="bi bi-clipboard me-1" aria-hidden="true"></i>
          {m.location_copy_btn()}
        </Button>
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
        <Form.Control
          size="sm"
          style={{ maxWidth: "240px" }}
          placeholder={`${m.location_col_country()} / ${m.location_col_location()}`}
          value={countryFilter}
          onChange={(event) => setCountryFilter(event.target.value)}
          aria-label={`${m.location_col_country()} / ${m.location_col_location()}`}
        />
        {table
          .getAllLeafColumns()
          .filter((column) => column.id !== "locationLabel")
          .map((column) => {
            const labelByColumn: Record<string, string> = {
              countryCode: m.location_col_country(),
              days: m.location_col_days(),
              percentage: "%",
            };
            const label = labelByColumn[column.id];
            if (label === undefined) {
              return null;
            }
          return (
            <Form.Check
              key={column.id}
              type="switch"
              id={`location-column-${column.id}`}
              label={label}
              checked={column.getIsVisible()}
              onChange={column.getToggleVisibilityHandler()}
            />
          );
          })}
      </div>
      <Table size="sm" bordered hover className="mb-0">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const meta = header.column.columnDef.meta;
                const ariaSort = sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none";
                return (
                  <th
                    key={header.id}
                    className={meta?.align === "end" ? "text-end" : undefined}
                    aria-sort={header.column.getCanSort() ? ariaSort : undefined}
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="btn btn-link p-0 text-decoration-none text-reset fw-semibold"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === "asc" ? " ↑" : sorted === "desc" ? " ↓" : ""}
                      </button>
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((tableRow) => {
            return (
              <tr key={tableRow.id}>
                {tableRow.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
