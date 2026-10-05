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
      <div className="mb-4 text-center">
        <h5 className="mb-3 text-xl font-medium">{m.wizard_team_heading()}</h5>
        <p className="text-muted-foreground">{m.wizard_team_subtitle()}</p>
      </div>

      <div className="mb-4">
        <h6 className="mb-3 text-base font-medium">{m.wizard_team_option1_heading()}</h6>
        <p className="mb-3 text-sm text-muted-foreground">{m.wizard_team_option1_desc()}</p>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
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
          <Separator className="my-4" />

          <div className="flex flex-col items-center text-center">
            <h6 className="mb-2 text-base font-medium">{m.wizard_team_option2_heading()}</h6>
            <p className="mb-3 text-sm text-muted-foreground">{m.wizard_team_option2_desc()}</p>
            <Button variant="outline" size="lg" onClick={onSkip}>
              <Icon icon={EyeIcon} />
              {m.wizard_team_browse_btn()}
            </Button>
          </div>
        </>
      )}

      <div className="mt-3 flex justify-start">
        <Button variant="outline" size="sm" onClick={onPrev}>
          <Icon icon={isChangeFlow ? XIcon : ArrowLeftIcon} />
          {isChangeFlow ? m.cancel() : m.back()}
        </Button>
      </div>
    </>
  );
}
