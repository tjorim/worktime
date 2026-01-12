import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useId } from "react";
import type { ShiftResult } from "../../utils/shiftCalculations";
import type { ScheduleOption } from "../../data/rosters";
import { getShiftDisplay } from "../../utils/shiftCalculations";

interface ShiftBadgeProps {
  shift: ShiftResult["shift"];
  scheduleType?: ScheduleOption | null;
  variant?: "code" | "name" | "both";
  pill?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTooltip?: boolean;
}

/**
 * Reusable shift badge component with schedule-aware styling and optional tooltip.
 *
 * @param shift - Shift object with code, name, className, etc.
 * @param scheduleType - Optional schedule type for display overrides
 * @param variant - What to display: 'code' (default), 'name', or 'both'
 * @param pill - Whether to use pill styling
 * @param size - Badge size: 'sm', 'md' (default), or 'lg'
 * @param className - Additional CSS classes
 * @param showTooltip - Whether to show tooltip on hover (default: true for 'code' variant)
 * @returns Badge component with shift styling
 */
export function ShiftBadge({
  shift,
  scheduleType,
  variant = "code",
  pill = false,
  size = "md",
  className = "",
  showTooltip = variant === "code",
}: ShiftBadgeProps) {
  const tooltipId = useId();
  const shiftDisplay = getShiftDisplay(shift, scheduleType);

  // Determine size class
  const getSizeClass = () => {
    if (size === "lg") {
      return "shift-badge-lg";
    }
    if (size === "sm") {
      return "shift-badge-sm";
    }
    return "";
  };
  const sizeClass = getSizeClass();

  // Determine content based on variant
  const getContent = () => {
    if (variant === "name") {
      return shiftDisplay.displayName;
    }
    if (variant === "both") {
      return `${shiftDisplay.displayCode} ${shiftDisplay.displayName}`;
    }
    return shiftDisplay.displayCode;
  };
  const content = getContent();

  const badge = (
    <Badge
      className={`shift-code ${sizeClass} ${showTooltip ? "cursor-help" : ""} ${shift.className} ${className}`.trim()}
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
            {shiftDisplay.displayName}
            {shift.isWorking && (
              <>
                <br />
                {shiftDisplay.displayHours}
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
