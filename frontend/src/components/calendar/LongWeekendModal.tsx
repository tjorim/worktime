import { NativeSelect } from "@/components/ui/native-select";
import { TriangleAlert as TriangleAlertIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import type { ChangeEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { LongWeekend } from "@/types/longWeekend";
import { getLocale } from "@/paraglide/runtime.js";
import * as m from "@/paraglide/messages.js";
import { dayjs } from "@/utils/dateTimeUtils";

interface LongWeekendModalProps {
  show: boolean;
  year: number;
  bridgeDays: number;
  periods: LongWeekend[];
  loading: boolean;
  error: string | null;
  onHide: () => void;
  onBridgeDaysChange: (days: number) => void;
}

/**
 * Modal showing long weekend opportunities for a calendar year.
 *
 * Lets users choose how many bridge days they are willing to take
 * and lists all periods where a long weekend is possible.
 * Marked periods are also highlighted in the month calendar.
 */
export function LongWeekendModal({
  show,
  year,
  bridgeDays,
  periods,
  loading,
  error,
  onHide,
  onBridgeDaysChange,
}: LongWeekendModalProps) {
  const locale = getLocale();

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(dayjs(iso).toDate());

  return (
    <Dialog
      open={show}
      onOpenChange={(open) => {
        if (!open) onHide();
      }}
    >
      <DialogContent scrollable>
        <DialogHeader>
          <DialogTitle>
            <span className="mr-2" aria-hidden="true">
              🏖️
            </span>
            {m.long_weekend_modal_title({ year: String(year) })}
          </DialogTitle>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-4">
            <label htmlFor="lw-bridge-days" className="mb-0 whitespace-nowrap">
              {m.long_weekend_bridge_days_label()}
            </label>
            <NativeSelect
              id="lw-bridge-days"
              className="max-w-32"
              value={bridgeDays}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                onBridgeDaysChange(Number(e.target.value))
              }
              aria-label={m.long_weekend_bridge_days_label()}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </NativeSelect>
          </div>

          {loading && (
            <div className="flex justify-center py-6">
              <Spinner role="status">
                <span className="sr-only">{m.loading()}</span>
              </Spinner>
            </div>
          )}

          {!loading && error && (
            <p className="text-danger-text text-sm mb-0">
              <Icon icon={TriangleAlertIcon} className="mr-1" />
              {error}
            </p>
          )}

          {!loading && !error && periods.length === 0 && (
            <p className="text-muted-foreground text-sm mb-0">
              {m.long_weekend_modal_empty({ year: String(year) })}
            </p>
          )}

          {!loading && !error && periods.length > 0 && (
            <ul className="list-none pl-0 mb-0 divide-y divide-border">
              {periods.map((period) => (
                <li key={period.startDate} className="px-0">
                  <div className="flex items-start gap-2">
                    <span aria-hidden="true" className="mt-1">
                      {period.needBridgeDay ? "🌉" : "🏖️"}
                    </span>
                    <div className="grow">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {formatDate(period.startDate)} – {formatDate(period.endDate)}
                        </span>
                        <Badge variant="secondary">
                          {m.long_weekend_days_short({ count: period.dayCount })}
                        </Badge>
                      </div>
                      {period.needBridgeDay && period.bridgeDays.length > 0 && (
                        <div className="text-muted-foreground text-sm mt-1">
                          {m.long_weekend_bridge_day_needed({
                            date: period.bridgeDays.map(formatDate).join(", "),
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onHide}>
            {m.close()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
