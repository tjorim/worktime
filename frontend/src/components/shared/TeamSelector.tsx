import { useId, type ReactNode } from "react";
import { Field, FieldLabel } from "@/components/ui/field";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { ScheduleOption } from "@/data/rosters";
import * as m from "@/paraglide/messages.js";
import { getTeamCountForOption } from "@/utils/scheduleUtils";

type TeamOption = { value: number; label: string };

type TeamSelectorProps = {
  scheduleType: ScheduleOption;
  selectedTeam: number | null;
  onChange: (team: number) => void;
  label: ReactNode;
  ariaLabel: string;
  availableTeams?: number[];
  inputId?: string;
  className?: string;
};

export function TeamSelector({
  scheduleType,
  selectedTeam,
  onChange,
  label,
  ariaLabel,
  availableTeams,
  inputId,
  className,
}: TeamSelectorProps) {
  const generatedId = useId();
  const effectiveId = inputId ?? generatedId;
  const teamNumbers =
    availableTeams ??
    Array.from({ length: getTeamCountForOption(scheduleType) }, (_, index) => index + 1);
  const options: TeamOption[] = teamNumbers.map((team) => ({
    value: team,
    label: m.team_label({ team: String(team) }),
  }));
  const value = options.find((option) => option.value === selectedTeam) ?? null;

  return (
    <Field className={className}>
      <FieldLabel htmlFor={effectiveId} className="font-semibold">
        {label}
      </FieldLabel>
      <Select
        items={options}
        value={value?.value ?? null}
        onValueChange={(team) => {
          if (team !== null) onChange(team);
        }}
      >
        <SelectTrigger id={effectiveId} aria-label={ariaLabel} className="w-full">
          <SelectValue placeholder={m.picker_placeholder()} />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
