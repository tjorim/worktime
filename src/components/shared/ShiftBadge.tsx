import Badge from "react-bootstrap/Badge";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useId } from "react";
import classNames from "classnames";
import type { ShiftResult } from "../../utils/shiftCalculations";
import type { ScheduleOption } from "../../data/rosters";
import { getShiftDisplay } from "../../utils/shiftCalculations";
import { useSettings } from "../../contexts/SettingsContext";

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
  const { scheduleType: userScheduleType } = useSettings();
  const effectiveScheduleType = scheduleType ?? userScheduleType;
  const shiftDisplay = getShiftDisplay(shift, effectiveScheduleType);

  const sizeClass = getSizeClass(size);
  const content = getBadgeContent(variant, shiftDisplay.displayCode, shiftDisplay.displayName);

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
