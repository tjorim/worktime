import { Info as InfoIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DetailsPopover, PopoverHeader, PopoverBody } from "@/components/ui/popover";
import * as m from "@/paraglide/messages.js";
import { ShiftBadge } from "@/components/shared/ShiftBadge";
import type { Shift } from "@/utils/shiftCalculations";

type CalendarLegendProps = {
  showEventTypes?: boolean;
  /** Shift types used by the active roster, shown color-coded to match the calendar */
  shifts?: Shift[];
};

/**
 * CalendarLegend displays a popover legend explaining event colors and indicators.
 *
 * Shows:
 * - Shift type colors with labels (when a schedule is active)
 * - Event type color dots with labels
 * - Day indicator emojis with explanations
 */
export function CalendarLegend({ showEventTypes = true, shifts }: CalendarLegendProps) {
  const eventTypeLegend = [
    { colorClass: "event-holiday-full", label: m.calendar_legend_holiday() },
    { colorClass: "event-business-full", label: m.calendar_legend_business() },
    { colorClass: "event-course-full", label: m.calendar_legend_course() },
    { colorClass: "event-in-full", label: m.calendar_legend_in_office() },
    { colorClass: "event-recurring-full", label: m.calendar_legend_day_off() },
    { colorClass: "event-birthday-full", label: m.calendar_legend_birthday() },
    { colorClass: "event-ill-full", label: m.calendar_legend_sick() },
    { colorClass: "event-other-full", label: m.calendar_legend_other() },
  ];

  const indicatorLegend = [
    { emoji: "🎉", label: m.calendar_public_holiday() },
    { emoji: "🏫", label: m.calendar_legend_school_holiday() },
    { emoji: "💶", label: m.calendar_legend_payday() },
    { emoji: "📘", label: m.calendar_legend_course_training() },
  ];

  const legendPopover = (
    <>
      <PopoverHeader>{m.team_legend_heading()}</PopoverHeader>
      <PopoverBody>
        {shifts && shifts.length > 0 && (
          <div className="mb-2">
            <strong className="text-sm">{m.calendar_legend_shift_types_heading()}</strong>
            <div className="flex flex-wrap gap-2 mt-1">
              {shifts.map((shift) => (
                <ShiftBadge key={shift.code} shift={shift} showEmoji showName size="sm" />
              ))}
            </div>
          </div>
        )}
        {showEventTypes && (
          <div className="mb-2">
            <strong className="text-sm">{m.calendar_legend_event_types_heading()}</strong>
            <div className="flex flex-wrap gap-2 mt-1">
              {eventTypeLegend.map(({ colorClass, label }) => (
                <span key={colorClass} className="inline-flex items-center gap-1">
                  <span className={cn("month-calendar-event-color", colorClass)} />
                  <small>{label}</small>
                </span>
              ))}
            </div>
          </div>
        )}
        <div>
          <strong className="text-sm">{m.calendar_legend_day_indicators_heading()}</strong>
          <div className="flex flex-wrap gap-2 mt-1">
            {indicatorLegend.map(({ emoji, label }) => (
              <span key={emoji} className="inline-flex items-center gap-1">
                <span className="text-sm">{emoji}</span>
                <small>{label}</small>
              </span>
            ))}
          </div>
        </div>
      </PopoverBody>
    </>
  );

  return (
    <DetailsPopover placement="left-end" content={legendPopover}>
      <Button variant="link" size="sm" className="text-muted-foreground p-0 no-underline">
        <Icon icon={InfoIcon} className="mr-1" />
        {m.calendar_legend_btn_label()}
      </Button>
    </DetailsPopover>
  );
}
