import { useMemo } from "react";
import Button from "react-bootstrap/Button";
import Table from "react-bootstrap/Table";
import { useToast } from "../../contexts/ToastContext";
import { aggregateLocationsByYear } from "../../utils/workLocationUtils";
import type { WorkLocation, WorkLocationMap } from "../../types/workLocation";

interface LocationYearSummaryProps {
  year: number;
  workLocationMap: WorkLocationMap;
}

const LOCATION_ICON: Record<WorkLocation, string> = {
  home: "bi-house",
  office: "bi-building",
  other: "bi-geo-alt",
};

const LOCATION_LABEL: Record<WorkLocation, string> = {
  home: "Home",
  office: "Office",
  other: "Other",
};

/**
 * Renders an annual work location summary grouped by (location, country, label).
 * Intended for tax return submission — includes a "Copy to clipboard" button.
 *
 * Only entries for the given year are included.
 */
export function LocationYearSummary({ year, workLocationMap }: LocationYearSummaryProps) {
  const toast = useToast();

  // Filter the map to only the requested year
  const yearPrefix = `${year}/`;
  const yearMap: WorkLocationMap = useMemo(() => {
    const filtered: WorkLocationMap = new Map();
    for (const [key, value] of workLocationMap.entries()) {
      if (key.startsWith(yearPrefix)) {
        filtered.set(key, value);
      }
    }
    return filtered;
  }, [workLocationMap, yearPrefix]);

  const rows = useMemo(() => aggregateLocationsByYear(yearMap), [yearMap]);

  const handleCopy = () => {
    const header = `Work Location Summary — ${year}`;
    const divider = "-".repeat(header.length);
    const lines = [
      header,
      divider,
      ...rows.map((row) => {
        const locationLabel = LOCATION_LABEL[row.location];
        const desc = row.label ? `${row.countryCode} (${row.label})` : row.countryCode;
        return `${locationLabel.padEnd(8)} ${desc.padEnd(20)} ${row.days} day${row.days !== 1 ? "s" : ""}`;
      }),
    ];

    navigator.clipboard
      .writeText(lines.join("\n"))
      .then(() => toast.showSuccess("Summary copied to clipboard"))
      .catch(() => toast.showError("Could not copy to clipboard"));
  };

  if (rows.length === 0) {
    return (
      <div className="text-muted small fst-italic py-2">
        No work locations recorded for {year}.
      </div>
    );
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <span className="fw-semibold small">
          <i className="bi bi-list-columns me-1" aria-hidden="true"></i>
          {year} Location Summary
        </span>
        <Button size="sm" variant="outline-secondary" onClick={handleCopy}>
          <i className="bi bi-clipboard me-1" aria-hidden="true"></i>
          Copy
        </Button>
      </div>
      <Table size="sm" bordered hover className="mb-0">
        <thead>
          <tr>
            <th>Location</th>
            <th>Country</th>
            <th className="text-end">Days</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              <td>
                <i className={`bi ${LOCATION_ICON[row.location]} me-1`} aria-hidden="true"></i>
                {LOCATION_LABEL[row.location]}
                {row.label && <span className="text-muted ms-1 small">({row.label})</span>}
              </td>
              <td>{row.countryCode}</td>
              <td className="text-end">{row.days}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
