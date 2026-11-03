import { Alert, AlertDescription } from "@/components/ui/alert";
import type { HolidayStatus } from "@/hooks/useStatisticsWorkingDays";
import * as m from "@/paraglide/messages.js";

/** Warns that statistics are incomplete while public holidays are loading or unavailable. */
export function HolidayStatusNotice({ status }: { status: HolidayStatus }) {
  if (status === "ready") return null;
  return (
    <Alert variant={status === "error" ? "warning" : "info"} data-slot="holiday-status-notice">
      <AlertDescription>
        {status === "error" ? m.stats_holidays_unavailable() : m.stats_holidays_loading()}
      </AlertDescription>
    </Alert>
  );
}
