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
  currentLabel = "Today",
  currentIcon = CalendarCheckIcon,
  previousAriaLabel = "Go to previous day",
  currentAriaLabel = "Go to today",
  nextAriaLabel = "Go to next day",
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
        <Icon icon={currentIcon} className="tw:me-1" />
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
    <div className="tw:flex tw:flex-col tw:sm:flex-row tw:items-stretch tw:sm:items-center tw:gap-2">
      {displayLabel && <span className="tw:text-muted-foreground tw:text-sm">{displayLabel}</span>}
      {selectorLabel && selectorValue !== undefined && onSelectorChange && (
        <div className="tw:flex tw:items-center tw:justify-between tw:gap-2">
          <FieldLabel
            htmlFor={effectiveSelectorId}
            className="tw:mb-0 tw:text-sm tw:text-muted-foreground"
          >
            {selectorLabel}
          </FieldLabel>
          <Input
            type="date"
            id={effectiveSelectorId}
            value={selectorValue}
            onChange={(event) => onSelectorChange(event.target.value)}
            className="tw:w-auto"
          />
        </div>
      )}
      <div className="tw:flex tw:gap-2">{buttons}</div>
    </div>
  );
}

export function DayNavigationButtonGroup(props: Omit<NavigationButtonGroupProps, "currentIcon">) {
  return <NavigationButtonGroup currentIcon={CalendarCheckIcon} {...props} />;
}

export function WeekNavigationButtonGroup({
  currentLabel = "This Week",
  previousAriaLabel = "Go to previous week",
  currentAriaLabel = "Go to current week",
  nextAriaLabel = "Go to next week",
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
  currentLabel = "Reset",
  previousAriaLabel = "Previous month",
  currentAriaLabel = "Reset to default range",
  nextAriaLabel = "Next month",
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
