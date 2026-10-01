import { ArrowLeft as ArrowLeftIcon, Eye as EyeIcon, X as XIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import * as m from "@/paraglide/messages.js";

interface Step4TeamSelectionProps {
  teams: number[];
  onTeamSelect: (team: number) => void;
  onSkip: () => void;
  onPrev: () => void;
  isChangeFlow: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step4TeamSelection({
  teams,
  onTeamSelect,
  onSkip,
  onPrev,
  isChangeFlow,
  firstButtonRef,
}: Step4TeamSelectionProps) {
  return (
    <>
      <div className="tw:mb-4 tw:text-center">
        <h5 className="tw:mb-3 tw:text-xl tw:font-medium">{m.wizard_team_heading()}</h5>
        <p className="tw:text-muted-foreground">{m.wizard_team_subtitle()}</p>
      </div>

      <div className="tw:mb-4">
        <h6 className="tw:mb-3 tw:text-base tw:font-medium">{m.wizard_team_option1_heading()}</h6>
        <p className="tw:mb-3 tw:text-sm tw:text-muted-foreground">
          {m.wizard_team_option1_desc()}
        </p>
        <div
          className="tw:grid tw:grid-cols-2 tw:gap-2 tw:sm:grid-cols-3"
          aria-label={m.wizard_team_select_aria()}
          role="group"
        >
          {teams.map((team, index) => (
            <Button
              key={team}
              variant="outline"
              size="lg"
              onClick={() => onTeamSelect(team)}
              aria-label={m.wizard_team_btn_aria({ team: String(team) })}
              ref={index === 0 ? firstButtonRef : undefined}
            >
              {m.wizard_team_btn_label({ team: String(team) })}
            </Button>
          ))}
        </div>
      </div>

      {/* Only show Browse All Teams option if there are multiple teams */}
      {teams.length > 1 && (
        <>
          <Separator className="tw:my-4" />

          <div className="tw:flex tw:flex-col tw:items-center tw:text-center">
            <h6 className="tw:mb-2 tw:text-base tw:font-medium">
              {m.wizard_team_option2_heading()}
            </h6>
            <p className="tw:mb-3 tw:text-sm tw:text-muted-foreground">
              {m.wizard_team_option2_desc()}
            </p>
            <Button variant="outline" size="lg" onClick={onSkip}>
              <Icon icon={EyeIcon} />
              {m.wizard_team_browse_btn()}
            </Button>
          </div>
        </>
      )}

      <div className="tw:mt-3 tw:flex tw:justify-start">
        <Button variant="outline" size="sm" onClick={onPrev}>
          <Icon icon={isChangeFlow ? XIcon : ArrowLeftIcon} />
          {isChangeFlow ? m.cancel() : m.back()}
        </Button>
      </div>
    </>
  );
}
