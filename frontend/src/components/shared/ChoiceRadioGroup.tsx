import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface ChoiceRadioGroupProps<T extends string> {
  /** Accessible name for the group. */
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; icon?: LucideIcon }>;
  className?: string;
}

/**
 * Required single choice (theme, language, time format) drawn as a segmented
 * control. Unlike `ChoiceToggleGroup` it uses radio semantics: exactly one
 * option is always checked, it cannot be deselected, and the arrow keys move
 * the selection. Use it where there is no "none" state; keep
 * `ChoiceToggleGroup` for view switchers and actions that re-fire on the
 * selected option.
 */
export function ChoiceRadioGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  className,
}: ChoiceRadioGroupProps<T>) {
  return (
    <RadioGroup
      variant="segmented"
      aria-label={label}
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className={className}
    >
      {options.map((option) => (
        <RadioGroupItem key={option.value} variant="segmented" value={option.value}>
          {option.icon ? <Icon icon={option.icon} className="me-1" /> : null}
          {option.label}
        </RadioGroupItem>
      ))}
    </RadioGroup>
  );
}
