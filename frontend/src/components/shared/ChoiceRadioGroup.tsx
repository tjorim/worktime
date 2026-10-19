import type { LucideIcon } from "lucide-react";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";
import { Icon } from "@/components/shared/Icon";
import { cn } from "@/lib/utils";

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
    <RadioGroupPrimitive
      aria-label={label}
      data-slot="choice-radio-group"
      value={value}
      onValueChange={(next) => onChange(next as T)}
      className={cn("flex w-fit flex-row flex-wrap items-center gap-1", className)}
    >
      {options.map((option) => (
        <RadioPrimitive.Root
          key={option.value}
          value={option.value}
          data-slot="choice-radio-group-item"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center justify-center gap-1 rounded-md border border-border bg-background px-2.5 text-sm font-medium whitespace-nowrap transition-all outline-none select-none hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 data-checked:bg-primary data-checked:text-primary-foreground data-checked:hover:bg-primary/80 data-disabled:pointer-events-none data-disabled:opacity-50 dark:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:data-checked:bg-primary dark:data-checked:hover:bg-primary/80 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-3.5"
        >
          {option.icon ? <Icon icon={option.icon} className="me-1" /> : null}
          {option.label}
        </RadioPrimitive.Root>
      ))}
    </RadioGroupPrimitive>
  );
}
