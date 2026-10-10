import {
  CalendarCheck as CalendarCheckIcon,
  CalendarClock as CalendarClockIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  House as HouseIcon,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { IconButton } from "@/components/shared/IconButton";
import * as m from "@/paraglide/messages.js";

type NavigationButtonGroupProps = {
  isCurrent: boolean;
  onPrevious: () => void;
  onCurrent: () => void;
  onNext: () => void;
  currentLabel?: string;
  currentIcon?: LucideIcon;
  previousAriaLabel?: string;
  currentAriaLabel?: string;
  nextAriaLabel?: string;
  size?: "sm" | "lg";
  inline?: boolean;
  selectorLabel?: string;
  selectorValue?: string;
  selectorId?: string;
  onSelectorChange?: (value: string) => void;
  displayLabel?: string; // Static label to display instead of interactive selector
};

function NavigationButtonGroup({
  isCurrent,
  onPrevious,
  onCurrent,
  onNext,
  currentLabel = m.today(),
  currentIcon = CalendarCheckIcon,
  previousAriaLabel = m.nav_prev_day(),
  currentAriaLabel = m.nav_today(),
  nextAriaLabel = m.nav_next_day(),
  size = "sm",
  inline = false,
  selectorLabel,
  selectorValue,
  selectorId,
  onSelectorChange,
  displayLabel,
}: NavigationButtonGroupProps) {
  const autoSelectorId = useId();
  const effectiveSelectorId = selectorId ?? autoSelectorId;
  const buttons = (
    <>
      <IconButton
        variant="outline"
        size={size}
        onClick={onPrevious}
        icon={ChevronLeftIcon}
        label={previousAriaLabel}
      />
      <Button
        variant={isCurrent ? "default" : "outline"}
        size={size}
        onClick={onCurrent}
        disabled={isCurrent}
        aria-label={currentAriaLabel}
      >
        <Icon icon={currentIcon} className="me-1" />
        {currentLabel}
      </Button>
      <IconButton
        variant="outline"
        size={size}
        onClick={onNext}
        icon={ChevronRightIcon}
        label={nextAriaLabel}
      />
    </>
  );

  if (inline) {
    return buttons;
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
      {displayLabel && <span className="text-muted-foreground text-sm">{displayLabel}</span>}
      {selectorLabel && selectorValue !== undefined && onSelectorChange && (
        <div className="flex items-center justify-between gap-2">
          <FieldLabel htmlFor={effectiveSelectorId} className="mb-0 text-sm text-muted-foreground">
            {selectorLabel}
          </FieldLabel>
          <Input
            type="date"
            id={effectiveSelectorId}
            value={selectorValue}
            onChange={(event) => onSelectorChange(event.target.value)}
            className="w-auto"
          />
        </div>
      )}
      <div className="flex gap-2">{buttons}</div>
    </div>
  );
}

export function DayNavigationButtonGroup(props: Omit<NavigationButtonGroupProps, "currentIcon">) {
  return <NavigationButtonGroup currentIcon={CalendarCheckIcon} {...props} />;
}

export function WeekNavigationButtonGroup({
  currentLabel = m.nav_this_week(),
  previousAriaLabel = m.nav_prev_week(),
  currentAriaLabel = m.nav_current_week(),
  nextAriaLabel = m.nav_next_week(),
  ...rest
}: Omit<NavigationButtonGroupProps, "currentIcon">) {
  return (
    <NavigationButtonGroup
      currentIcon={HouseIcon}
      currentLabel={currentLabel}
      previousAriaLabel={previousAriaLabel}
      currentAriaLabel={currentAriaLabel}
      nextAriaLabel={nextAriaLabel}
      {...rest}
    />
  );
}

export function MonthNavigationButtonGroup({
  currentLabel = m.timeoff_reset_btn(),
  previousAriaLabel = m.nav_prev_month(),
  currentAriaLabel = m.nav_reset_range(),
  nextAriaLabel = m.nav_next_month(),
  ...rest
}: Omit<NavigationButtonGroupProps, "currentIcon">) {
  return (
    <NavigationButtonGroup
      currentIcon={CalendarClockIcon}
      currentLabel={currentLabel}
      previousAriaLabel={previousAriaLabel}
      currentAriaLabel={currentAriaLabel}
      nextAriaLabel={nextAriaLabel}
      {...rest}
    />
  );
}
