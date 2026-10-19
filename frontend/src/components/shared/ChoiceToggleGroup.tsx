import type { LucideIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

interface ChoiceToggleGroupProps<T extends string> {
  /** Accessible name for the group. */
  label: string;
  /** Selected option, or `undefined` when none is selected. */
  value: T | undefined;
  /** Called whenever an option is activated, including the already-selected one. */
  onChange: (value: T) => void;
  options: ReadonlyArray<{ value: T; label: string; icon?: LucideIcon }>;
  /** Stretch the options to share the available width equally. */
  fill?: boolean;
  className?: string;
}

/**
 * Compact single-choice selection (view switchers, work location, theme, ...).
 * Wraps the Base UI toggle group, which exposes `aria-pressed` per option and
 * arrow-key navigation. `onChange` fires on every activation rather than only
 * on changes, so choosing the selected option again can still reopen a dialog.
 */
export function ChoiceToggleGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  fill = false,
  className,
}: ChoiceToggleGroupProps<T>) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value === undefined ? [] : [value]}
      variant="outline"
      size="sm"
      className={cn("flex-wrap", fill && "w-full max-w-sm flex-nowrap", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn(fill && "flex-1")}
          onClick={() => onChange(option.value)}
        >
          {option.icon ? <Icon icon={option.icon} className="me-1" /> : null}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
