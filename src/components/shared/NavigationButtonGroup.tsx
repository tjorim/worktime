import { useId } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

type NavigationButtonGroupProps = {
  isCurrent: boolean;
  onPrevious: () => void;
  onCurrent: () => void;
  onNext: () => void;
  currentLabel?: string;
  currentIcon?: string;
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
  currentIcon = "bi-calendar-check",
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
      <Button
        variant="outline-secondary"
        size={size}
        onClick={onPrevious}
        aria-label={previousAriaLabel}
      >
        <i className="bi bi-chevron-left" aria-hidden="true"></i>
      </Button>
      <Button
        variant={isCurrent ? "primary" : "outline-primary"}
        size={size}
        onClick={onCurrent}
        disabled={isCurrent}
        aria-label={currentAriaLabel}
      >
        <i className={`bi ${currentIcon} me-1`} aria-hidden="true"></i>
        {currentLabel}
      </Button>
      <Button variant="outline-secondary" size={size} onClick={onNext} aria-label={nextAriaLabel}>
        <i className="bi bi-chevron-right" aria-hidden="true"></i>
      </Button>
    </>
  );

  if (inline) {
    return buttons;
  }

  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      {displayLabel && <span className="text-muted small">{displayLabel}</span>}
      {selectorLabel && selectorValue !== undefined && onSelectorChange && (
        <div className="d-flex align-items-center gap-2">
          <Form.Label htmlFor={effectiveSelectorId} className="mb-0 small text-muted">
            {selectorLabel}
          </Form.Label>
          <Form.Control
            type="date"
            id={effectiveSelectorId}
            size="sm"
            value={selectorValue}
            onChange={(event) => onSelectorChange(event.target.value)}
            className="date-picker-auto"
          />
        </div>
      )}
      <div className="d-flex gap-2">{buttons}</div>
    </div>
  );
}

export function DayNavigationButtonGroup(props: Omit<NavigationButtonGroupProps, "currentIcon">) {
  return <NavigationButtonGroup currentIcon="bi-calendar-check" {...props} />;
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
      currentIcon="bi-house"
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
      currentIcon="bi-calendar-event"
      currentLabel={currentLabel}
      previousAriaLabel={previousAriaLabel}
      currentAriaLabel={currentAriaLabel}
      nextAriaLabel={nextAriaLabel}
      {...rest}
    />
  );
}
