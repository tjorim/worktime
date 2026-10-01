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
      <ul className="tw:m-0 tw:mb-4 tw:flex tw:list-none tw:flex-col tw:gap-2 tw:p-0">
        {SCHEDULE_OPTIONS.map((schedule) => {
          const isSelected = scheduleType === schedule.value;
          const option = (
            <Button
              variant={isSelected ? "default" : "outline"}
              aria-pressed={isSelected}
              disabled={!schedule.isAvailable}
              onClick={() => schedule.isAvailable && onScheduleChange(schedule.value)}
              className="tw:h-auto tw:w-full tw:justify-between tw:gap-2 tw:py-2 tw:text-left tw:whitespace-normal"
            >
              <span className="tw:flex tw:flex-col">
                <span className="tw:flex tw:items-center tw:gap-2 tw:font-semibold">
                  {schedule.title}
                  {!schedule.isAvailable && (
                    <Badge variant="secondary">{m.wizard_coming_soon_badge()}</Badge>
                  )}
                </span>
                <span
                  className={cn(
                    "tw:text-sm tw:font-normal",
                    isSelected ? "tw:text-primary-foreground/80" : "tw:text-muted-foreground",
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
                  <span className="tw:block">{option}</span>
                </Hint>
              )}
            </li>
          );
        })}
      </ul>

      {scheduleType && hasMultipleTeams(scheduleType) && (
        <div className="tw:mb-4">
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

      <Separator className="tw:my-4" />
      <SettingsHdayHelper />
    </SettingsSection>
  );
}
