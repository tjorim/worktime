import { CalendarDays as CalendarDaysIcon, Check as CheckIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Hint } from "@/components/ui/tooltip";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { cn } from "@/lib/utils";
import { hasMultipleTeams } from "@/utils/scheduleUtils";
import * as m from "@/paraglide/messages.js";
import { SettingsHdayHelper } from "@/components/settings/SettingsHdayHelper";
import { SettingsHint, SettingsSection } from "@/components/settings/SettingsParts";
import { TeamSelector } from "@/components/shared/TeamSelector";

interface SettingsScheduleSectionProps {
  scheduleType: ScheduleOption | null;
  myTeam: number | null;
  onScheduleChange: (schedule: ScheduleOption) => void;
  onTeamChange: (team: number) => void;
}

export function SettingsScheduleSection({
  scheduleType,
  myTeam,
  onScheduleChange,
  onTeamChange,
}: SettingsScheduleSectionProps) {
  return (
    <SettingsSection icon={CalendarDaysIcon} title={m.select_schedule_label()}>
      <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
        {SCHEDULE_OPTIONS.map((schedule) => {
          const isSelected = scheduleType === schedule.value;
          const option = (
            <Button
              variant={isSelected ? "default" : "outline"}
              aria-pressed={isSelected}
              disabled={!schedule.isAvailable}
              onClick={() => schedule.isAvailable && onScheduleChange(schedule.value)}
              className="h-auto w-full justify-between gap-2 py-2 text-left whitespace-normal"
            >
              <span className="flex flex-col">
                <span className="flex items-center gap-2 font-semibold">
                  {schedule.title}
                  {!schedule.isAvailable && (
                    <Badge variant="secondary">{m.wizard_coming_soon_badge()}</Badge>
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm font-normal",
                    isSelected ? "text-primary-foreground" : "text-muted-foreground",
                  )}
                >
                  {schedule.description}
                </span>
              </span>
              {isSelected && <Icon icon={CheckIcon} />}
            </Button>
          );
          return (
            <li key={schedule.value}>
              {schedule.isAvailable ? (
                option
              ) : (
                <Hint
                  placement="top"
                  content={<div>{m.wizard_schedule_coming_soon_tooltip()}</div>}
                >
                  <span className="block">{option}</span>
                </Hint>
              )}
            </li>
          );
        })}
      </ul>

      {scheduleType && hasMultipleTeams(scheduleType) && (
        <div className="mb-4">
          <TeamSelector
            scheduleType={scheduleType}
            selectedTeam={myTeam}
            onChange={onTeamChange}
            label={m.select_team_label()}
            ariaLabel={m.select_team_label()}
          />
          {myTeam === null && <SettingsHint>{m.settings_no_team_selected()}</SettingsHint>}
        </div>
      )}

      <Separator className="my-4" />
      <SettingsHdayHelper />
    </SettingsSection>
  );
}
