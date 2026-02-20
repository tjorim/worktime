import Badge from "react-bootstrap/Badge";
import ProgressBar from "react-bootstrap/ProgressBar";
import { dayjs } from "../../utils/dateTimeUtils";
import { getWfhDaysInWeek } from "../../utils/workLocationUtils";
import type { WorkLocationMap } from "../../types/workLocation";

interface WfhStatsBarProps {
  workLocationMap: WorkLocationMap;
  wfhWeeklyLimit: number;
}

/**
 * Displays the current week's WFH (work-from-home) day count versus the configured weekly limit.
 *
 * Shows a progress bar and a warning badge when the limit is exceeded.
 * Always reflects the current ISO week (today's date), not the viewed calendar month.
 */
export function WfhStatsBar({ workLocationMap, wfhWeeklyLimit }: WfhStatsBarProps) {
  const today = dayjs();
  const wfhCount = getWfhDaysInWeek(today, workLocationMap);
  const limitExceeded = wfhCount > wfhWeeklyLimit;
  const progressPercent = wfhWeeklyLimit > 0 ? Math.min((wfhCount / wfhWeeklyLimit) * 100, 100) : 0;
  const progressVariant = limitExceeded ? "warning" : wfhCount === wfhWeeklyLimit ? "info" : "success";

  return (
    <div className="wfh-stats-bar d-flex align-items-center gap-2 px-1 py-2">
      <i className="bi bi-house-fill text-muted flex-shrink-0" aria-hidden="true"></i>
      <span className="text-muted small flex-shrink-0">WFH this week:</span>
      <div className="flex-grow-1" style={{ minWidth: "4rem" }}>
        <ProgressBar
          now={progressPercent}
          variant={progressVariant}
          style={{ height: "0.5rem" }}
          aria-label={`WFH days this week: ${wfhCount} of ${wfhWeeklyLimit}`}
        />
      </div>
      <span className="small flex-shrink-0">
        {wfhCount}/{wfhWeeklyLimit}
      </span>
      {limitExceeded && (
        <Badge bg="warning" text="dark" className="flex-shrink-0">
          <i className="bi bi-exclamation-triangle me-1" aria-hidden="true"></i>
          Limit exceeded
        </Badge>
      )}
    </div>
  );
}
