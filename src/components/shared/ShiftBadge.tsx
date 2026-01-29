import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useId } from "react";
import classNames from "classnames";
import { useFormattedShiftTime } from "../../hooks/useFormattedShiftTime";
import type { ShiftResult } from "../../utils/shiftCalculations";

// Helper: Determine size class
const getSizeClass = (size: "sm" | "md" | "lg"): string => {
  if (size === "lg") return "shift-badge-lg";
  if (size === "sm") return "shift-badge-sm";
  return "";
};

// Helper: Determine badge content based on variant
const getBadgeContent = (
  variant: "code" | "name" | "both",
  displayCode: string,
  displayName: string,
): string => {
  if (variant === "name") return displayName;
  if (variant === "both") return `${displayCode} ${displayName}`;
  return displayCode;
};

interface ShiftBadgeProps {
  shift: ShiftResult["shift"];
  variant?: "code" | "name" | "both";
  pill?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  showTooltip?: boolean;
}

/**
 * Reusable shift badge component with styling and optional tooltip.
 *
 * @param shift - Shift object with code, name, className, etc.
 * @param variant - What to display: 'code' (default), 'name', or 'both'
 * @param pill - Whether to use pill styling
 * @param size - Badge size: 'sm', 'md' (default), or 'lg'
 * @param className - Additional CSS classes
 * @param showTooltip - Whether to show tooltip on hover (default: true for 'code' variant)
 * @returns Badge component with shift styling
 */
export function ShiftBadge({
  shift,
  variant = "code",
  pill = false,
  size = "md",
  className = "",
  showTooltip = variant === "code",
}: ShiftBadgeProps) {
  const tooltipId = useId();
  const formattedTime = useFormattedShiftTime(shift);

  const sizeClass = getSizeClass(size);
  const content = getBadgeContent(variant, shift.displayCode, shift.name);

  const badge = (
    <Badge
      className={classNames(
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
            {shift.name}
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
