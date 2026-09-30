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
            <span className="tw:mr-2" aria-hidden="true">
              🏖️
            </span>
            {m.long_weekend_modal_title({ year: String(year) })}
          </DialogTitle>
        </DialogHeader>
        <div className="tw:min-h-0 tw:overflow-y-auto tw:p-4">
          <div className="tw:flex tw:items-center tw:gap-2 tw:mb-4">
            <label htmlFor="lw-bridge-days" className="tw:mb-0 tw:whitespace-nowrap">
              {m.long_weekend_bridge_days_label()}
            </label>
            <NativeSelect
              id="lw-bridge-days"
              className="tw:max-w-32"
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
            <div className="tw:flex tw:justify-center tw:py-6">
              <Spinner role="status">
                <span className="tw:sr-only">{m.loading()}</span>
              </Spinner>
            </div>
          )}

          {!loading && error && (
            <p className="tw:text-danger-text tw:text-sm tw:mb-0">
              <Icon icon={TriangleAlertIcon} className="tw:mr-1" />
              {error}
            </p>
          )}

          {!loading && !error && periods.length === 0 && (
            <p className="tw:text-muted-foreground tw:text-sm tw:mb-0">
              {m.long_weekend_modal_empty({ year: String(year) })}
            </p>
          )}

          {!loading && !error && periods.length > 0 && (
            <ul className="tw:list-none tw:pl-0 tw:mb-0 tw:divide-y tw:divide-border">
              {periods.map((period) => (
                <li key={period.startDate} className="tw:px-0">
                  <div className="tw:flex tw:items-start tw:gap-2">
                    <span aria-hidden="true" className="tw:mt-1">
                      {period.needBridgeDay ? "🌉" : "🏖️"}
                    </span>
                    <div className="tw:grow">
                      <div className="tw:flex tw:items-center tw:gap-2 tw:flex-wrap">
                        <span className="fw-medium">
                          {formatDate(period.startDate)} – {formatDate(period.endDate)}
                        </span>
                        <Badge variant="secondary">{period.dayCount}d</Badge>
                      </div>
                      {period.needBridgeDay && period.bridgeDays.length > 0 && (
                        <div className="tw:text-muted-foreground tw:text-sm tw:mt-1">
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
