import { useId } from "react";
import Button from "react-bootstrap/Button";
import Form from "react-bootstrap/Form";

type DayNavigationButtonGroupProps = {
  isCurrent: boolean;
  onPrevious: () => void;
  onCurrent: () => void;
  onNext: () => void;
  currentLabel?: string;
  previousAriaLabel?: string;
  currentAriaLabel?: string;
  nextAriaLabel?: string;
  size?: "sm" | "lg";
  inline?: boolean;
  selectorLabel?: string;
  selectorValue?: string;
  selectorId?: string;
  onSelectorChange?: (value: string) => void;
};

type WeekNavigationButtonGroupProps = {
  isCurrent: boolean;
  onPrevious: () => void;
  onCurrent: () => void;
  onNext: () => void;
  currentLabel?: string;
  previousAriaLabel?: string;
  currentAriaLabel?: string;
  nextAriaLabel?: string;
  size?: "sm" | "lg";
  inline?: boolean;
  selectorLabel?: string;
  selectorValue?: string;
  selectorId?: string;
  onSelectorChange?: (value: string) => void;
};

export function DayNavigationButtonGroup({
  isCurrent,
  onPrevious,
  onCurrent,
  onNext,
  currentLabel = "Today",
  previousAriaLabel = "Go to previous day",
  currentAriaLabel = "Go to today",
  nextAriaLabel = "Go to next day",
  size = "sm",
  inline = false,
  selectorLabel,
  selectorValue,
  selectorId,
  onSelectorChange,
}: DayNavigationButtonGroupProps) {
  const autoDaySelectorId = useId();
  const effectiveDaySelectorId = selectorId ?? autoDaySelectorId;
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
        <i className="bi bi-calendar-check me-1" aria-hidden="true"></i>
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
      {selectorLabel && selectorValue !== undefined && onSelectorChange && (
        <div className="d-flex align-items-center gap-2">
          <Form.Label htmlFor={effectiveDaySelectorId} className="mb-0 small text-muted">
            {selectorLabel}
          </Form.Label>
          <Form.Control
            type="date"
            id={effectiveDaySelectorId}
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

export function WeekNavigationButtonGroup({
  isCurrent,
  onPrevious,
  onCurrent,
  onNext,
  currentLabel = "This Week",
  previousAriaLabel = "Go to previous week",
  currentAriaLabel = "Go to current week",
  nextAriaLabel = "Go to next week",
  size = "sm",
  inline = false,
  selectorLabel,
  selectorValue,
  selectorId,
  onSelectorChange,
}: WeekNavigationButtonGroupProps) {
  const autoWeekSelectorId = useId();
  const effectiveWeekSelectorId = selectorId ?? autoWeekSelectorId;
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
        <i className="bi bi-house me-1" aria-hidden="true"></i>
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
      {selectorLabel && selectorValue !== undefined && onSelectorChange && (
        <div className="d-flex align-items-center gap-2">
          <Form.Label htmlFor={effectiveWeekSelectorId} className="mb-0 small text-muted">
            {selectorLabel}
          </Form.Label>
          <Form.Control
            type="date"
            id={effectiveWeekSelectorId}
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
