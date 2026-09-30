import { Badge } from "@/components/ui/badge";
import { Hint } from "@/components/ui/tooltip";
import { useId } from "react";
import clsx from "clsx";
import { useFormattedShiftTime } from "@/hooks/useFormattedShiftTime";
import type { ShiftResult } from "@/utils/shiftCalculations";

export const shiftColors: Record<string, string> = {
  "shift-morning": "tw:bg-wt-shift-morning tw:text-wt-shift-morning-text",
  "shift-late": "tw:bg-wt-shift-late tw:text-wt-shift-late-text",
  "shift-night": "tw:bg-wt-shift-night tw:text-wt-shift-night-text",
  "shift-day": "tw:bg-wt-shift-day tw:text-wt-shift-day-text",
  "shift-off": "tw:bg-wt-shift-off tw:text-wt-shift-off-text",
};
const sizes = {
  sm: "tw:px-2 tw:py-0.5 tw:text-xs",
  md: "tw:px-2 tw:py-1 tw:text-sm",
  lg: "tw:px-4 tw:py-2 tw:text-base",
};

// Helper: Build badge content from boolean flags
const getBadgeContent = (
  shift: ShiftResult["shift"],
  showEmoji: boolean,
  showCode: boolean,
  showName: boolean,
): string => {
  const parts: string[] = [];
  if (showEmoji) parts.push(shift.emoji);
  if (showCode) parts.push(shift.displayCode);
  if (showName) parts.push(shift.name);
  return parts.join(" ");
};

interface ShiftBadgeProps {
  shift: ShiftResult["shift"];
  showEmoji?: boolean;
  showCode?: boolean;
  showName?: boolean;
  pill?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTooltip?: boolean;
  /** Native title attribute, useful as a lightweight hover hint when showTooltip is false */
  title?: string;
}

/**
 * Reusable shift badge component with styling and optional tooltip.
 *
 * Content is controlled by boolean flags: `showEmoji`, `showCode`, `showName`.
 * By default only `showCode` is true, displaying the shift display code (e.g., "M").
 *
 * @param shift - Shift object with code, name, className, etc.
 * @param showEmoji - Show shift emoji (e.g., "🌅")
 * @param showCode - Show shift display code (default: true when showName is false)
 * @param showName - Show shift name (e.g., "Morning")
 * @param pill - Whether to use pill styling
 * @param size - Badge size: 'sm', 'md' (default), or 'lg'
 * @param className - Additional CSS classes
 * @param showTooltip - Whether to show tooltip on hover (default: true when only showCode is active)
 * @returns Badge component with shift styling
 */
export function ShiftBadge({
  shift,
  showEmoji = false,
  showName = false,
  showCode = !showName,
  pill = false,
  size = "md",
  className = "",
  showTooltip = showCode && !showName && !showEmoji,
  title,
}: ShiftBadgeProps) {
  const tooltipId = useId();
  const formattedTime = useFormattedShiftTime(shift);

  const sizeClass = sizes[size];
  const content = getBadgeContent(shift, showEmoji, showCode, showName);
  // shift.className reflects the roster's shift code (e.g. "shift-day"),
  // independent of shift.isWorking — callers like CalendarView override
  // isWorking to false for a day with time off or a public holiday without
  // changing the underlying code. Left alone that shows a vividly-colored
  // working-shift badge on a day the person isn't actually working; fall
  // back to the muted "off" style instead so the badge matches reality.
  const badgeClassName = shift.isWorking ? shift.className : "shift-off";

  const badge = (
    <Badge
      variant="outline"
      className={clsx(
        "tw:h-auto tw:min-w-8 tw:font-semibold",
        pill ? "tw:rounded-full" : "tw:rounded-md",
        sizeClass,
        showTooltip && "tw:cursor-help",
        shiftColors[badgeClassName] ?? shiftColors["shift-off"],
        className,
      )}
      title={title}
    >
      {content}
    </Badge>
  );

  if (showTooltip) {
    return (
      <Hint
        placement="top"
        content={
          <div id={tooltipId}>
            {shift.emoji} {shift.name}
            {shift.isWorking && (
              <>
                <br />
                {formattedTime}
              </>
            )}
          </div>
        }
      >
        {badge}
      </Hint>
    );
  }

  return badge;
}
