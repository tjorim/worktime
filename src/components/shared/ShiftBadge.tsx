import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useId } from "react";
import clsx from "clsx";
import { useFormattedShiftTime } from "../../hooks/useFormattedShiftTime";
import type { ShiftResult } from "../../utils/shiftCalculations";

// Helper: Determine size class
const getSizeClass = (size: "sm" | "md" | "lg"): string => {
  if (size === "lg") return "shift-badge-lg";
  if (size === "sm") return "shift-badge-sm";
  return "";
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
}: ShiftBadgeProps) {
  const tooltipId = useId();
  const formattedTime = useFormattedShiftTime(shift);

  const sizeClass = getSizeClass(size);
  const content = getBadgeContent(shift, showEmoji, showCode, showName);

  const badge = (
    <Badge
      bg=""
      className={clsx(
        "shift-code",
        sizeClass,
        showTooltip && "cursor-help",
        shift.className,
        className,
      )}
      pill={pill}
    >
      {content}
    </Badge>
  );

  if (showTooltip) {
    return (
      <OverlayTrigger
        placement="top"
        overlay={
          <Tooltip id={tooltipId}>
            {shift.emoji} {shift.name}
            {shift.isWorking && (
              <>
                <br />
                {formattedTime}
              </>
            )}
          </Tooltip>
        }
      >
        {badge}
      </OverlayTrigger>
    );
  }

  return badge;
}
