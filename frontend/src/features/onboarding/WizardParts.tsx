import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FieldDescription } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface WizardActionsProps {
  /** Secondary action (back/cancel/later), shown at the start on wide screens and last when stacked. */
  start?: ReactNode;
  /** Primary action, shown first when the buttons stack on narrow screens. */
  end?: ReactNode;
  className?: string;
}

/** Shared back/next footer: stacks with the primary action on top below `sm`. */
export function WizardActions({ start, end, className }: WizardActionsProps) {
  return (
    <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-between", className)}>
      {start}
      {end}
    </div>
  );
}

interface WizardToggleProps {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

/** Optional-feature switch; the hint explaining the opt-out is only shown while it is off. */
export function WizardToggle({ id, label, hint, checked, onCheckedChange }: WizardToggleProps) {
  const hintId = `${id}-hint`;

  return (
    <div className="mt-3">
      <Label className="text-base">
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-describedby={checked ? undefined : hintId}
        />
        {label}
      </Label>
      {!checked && (
        <FieldDescription id={hintId} className="mt-2">
          {hint}
        </FieldDescription>
      )}
    </div>
  );
}
