import { dayjs } from "../../utils/dateTimeUtils";
import { getLocationCountsInWeek } from "../../utils/workLocationUtils";
import type { WorkLocationMap } from "../../types/workLocation";

interface LocationSummaryBarProps {
  workLocationMap: WorkLocationMap;
}

/**
 * Displays the current week's work location counts (home / office / other).
 * Only non-zero counts are shown. Reflects the current ISO week (today's date).
 */
export function LocationSummaryBar({ workLocationMap }: LocationSummaryBarProps) {
  const today = dayjs();
  const counts = getLocationCountsInWeek(today, workLocationMap);
  const hasAny = counts.home > 0 || counts.office > 0 || counts.other > 0;

  if (!hasAny) {
    return (
      <div className="location-summary-bar d-flex align-items-center gap-2 px-1 py-2 text-muted small">
        <i className="bi bi-calendar-week flex-shrink-0" aria-hidden="true"></i>
        No locations recorded this week
      </div>
    );
  }

  return (
    <div
      className="location-summary-bar d-flex align-items-center gap-3 px-1 py-2"
      aria-label="Work locations this week"
    >
      <span className="text-muted small flex-shrink-0">This week:</span>
      {counts.home > 0 && (
        <span className="small d-flex align-items-center gap-1" title="Work from home days">
          <i className="bi bi-house" aria-hidden="true"></i>
          {counts.home}
        </span>
      )}
      {counts.office > 0 && (
        <span className="small d-flex align-items-center gap-1" title="Office days">
          <i className="bi bi-building" aria-hidden="true"></i>
          {counts.office}
        </span>
      )}
      {counts.other > 0 && (
        <span className="small d-flex align-items-center gap-1" title="Other location days">
          <i className="bi bi-geo-alt" aria-hidden="true"></i>
          {counts.other}
        </span>
      )}
    </div>
  );
}
