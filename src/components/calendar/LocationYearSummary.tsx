import { useMemo } from "react";
import Button from "react-bootstrap/Button";
import Table from "react-bootstrap/Table";
import { useToast } from "../../contexts/ToastContext";
import { aggregateLocationCounts } from "../../utils/workLocationUtils";
import type { WorkLocationMap } from "../../types/workLocation";
import { WORK_LOCATION_ICON_CLASS, WORK_LOCATION_LABEL } from "./workLocationConstants";
import * as m from "../../paraglide/messages.js";

interface LocationYearSummaryProps {
  year: number;
  workLocationMap: WorkLocationMap;
}

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

  const rows = useMemo(() => aggregateLocationCounts(yearMap), [yearMap]);
  const totalDays = useMemo(() => rows.reduce((sum, r) => sum + r.days, 0), [rows]);

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
      ...rows.map((row) => {
        const locationLabel = WORK_LOCATION_LABEL[row.location];
        const pct = totalDays > 0 ? Math.round((row.days / totalDays) * 100) : 0;
        const dayLabel =
          row.days === 1
            ? m.location_days_count({ count: row.days })
            : m.location_days_count_plural({ count: row.days });
        return `${locationLabel.padEnd(8)} ${row.countryCode.padEnd(20)} ${dayLabel} (${pct}%)`;
      }),
    ];

    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.showSuccess(m.location_copied()))
      .catch(() => toast.showError(m.location_copy_failed()));
  };

  if (rows.length === 0) {
    return (
      <div className="text-muted small fst-italic py-2">{m.location_no_data({ year })}</div>
    );
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
      <Table size="sm" bordered hover className="mb-0">
        <thead>
          <tr>
            <th>{m.location_col_location()}</th>
            <th>{m.location_col_country()}</th>
            <th className="text-end">{m.location_col_days()}</th>
            <th className="text-end">%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const locationLabelMap = {
              home: m.work_location_home(),
              office: m.work_location_office(),
              other: m.work_location_other(),
            } as const;
            const locationLabel = locationLabelMap[row.location] ?? row.location;
            return (
              <tr key={`${row.location}-${row.countryCode}`}>
                <td>
                  <i
                    className={`bi ${WORK_LOCATION_ICON_CLASS[row.location]} me-1`}
                    aria-hidden="true"
                  ></i>
                  {locationLabel}
                </td>
                <td>{row.countryCode}</td>
                <td className="text-end">{row.days}</td>
                <td className="text-end text-muted">
                  {totalDays > 0 ? `${Math.round((row.days / totalDays) * 100)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}
