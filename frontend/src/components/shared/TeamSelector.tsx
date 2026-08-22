import { useId, type ReactNode } from "react";
import Form from "react-bootstrap/Form";
import ReactSelect from "react-select";
import type { ScheduleOption } from "@/data/rosters";
import * as m from "@/paraglide/messages.js";
import { getTeamCountForOption } from "@/utils/scheduleUtils";
import { bootstrapSelectClassNames } from "@/utils/reactSelectStyles";

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
    <Form.Group className={className} controlId={effectiveId}>
      <Form.Label className="fw-semibold">{label}</Form.Label>
      <ReactSelect<TeamOption>
        unstyled
        isSearchable={false}
        inputId={effectiveId}
        aria-label={ariaLabel}
        options={options}
        value={value}
        onChange={(option) => {
          if (option) onChange(Number(option.value));
        }}
        classNames={bootstrapSelectClassNames}
      />
    </Form.Group>
  );
}
