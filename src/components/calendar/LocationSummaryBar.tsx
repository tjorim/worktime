import { dayjs } from "../../utils/dateTimeUtils";
import { getLocationCountsInWeek } from "../../utils/workLocationUtils";
import type { WorkLocationMap } from "../../types/workLocation";
import {
  WORK_LOCATION_ICON_CLASS,
  WORK_LOCATION_LABEL,
  WORK_LOCATION_ORDER,
  WORK_LOCATION_WEEKLY_TITLE,
} from "./workLocationConstants";

interface LocationSummaryBarProps {
  workLocationMap: WorkLocationMap;
  today?: Parameters<typeof dayjs>[0]; // Accepts Dayjs | string | undefined
}

/**
 * Displays the current week's work location counts (home / office / other).
 * Only non-zero counts are shown. Reflects the current ISO week (today's date).
 */

export function LocationSummaryBar({ workLocationMap, today }: LocationSummaryBarProps) {
  const day = dayjs(today);
  const counts = getLocationCountsInWeek(day, workLocationMap);
  const hasAny = WORK_LOCATION_ORDER.some((location) => counts[location] > 0);

  if (!hasAny) {
    return (
      <div
        className="location-summary-bar d-flex align-items-center gap-2 px-1 py-2 text-muted small"
        aria-label="Work locations this week"
      >
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
      {WORK_LOCATION_ORDER.map((location) => {
        const count = counts[location];
        if (count <= 0) {
          return null;
        }
        return (
          <span
            key={location}
            className="small d-flex align-items-center gap-1"
            title={WORK_LOCATION_WEEKLY_TITLE[location]}
          >
            <i className={`bi ${WORK_LOCATION_ICON_CLASS[location]}`} aria-hidden="true"></i>
            <span className="visually-hidden">{WORK_LOCATION_LABEL[location]} days:</span>
            {count}
          </span>
        );
      })}
    </div>
  );
}
