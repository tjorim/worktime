import { ArrowLeft as ArrowLeftIcon, ArrowRight as ArrowRightIcon, X as XIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { WizardActions } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step3ScheduleSelectionProps {
  selectedSchedule: ScheduleOption | null;
  onScheduleChange: (schedule: ScheduleOption) => void;
  onPrev: () => void;
  onNext: () => void;
  isChangeFlow: boolean;
  shouldShowTeamSelection: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step3ScheduleSelection({
  selectedSchedule,
  onScheduleChange,
  onPrev,
  onNext,
  isChangeFlow,
  shouldShowTeamSelection,
  firstButtonRef,
}: Step3ScheduleSelectionProps) {
  const continueLabel =
    isChangeFlow && !shouldShowTeamSelection ? m.wizard_schedule_save() : m.continue();

  return (
    <>
      <div className="mb-4 text-center">
        <h5 className="mb-2 text-xl font-medium">{m.wizard_schedule_heading()}</h5>
        <p className="text-muted-foreground">{m.wizard_schedule_subtitle()}</p>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        {SCHEDULE_OPTIONS.map((schedule) => {
          const isSelected = selectedSchedule === schedule.value;

          const buttonInner = (
            <>
              <span className="flex items-center gap-2 font-semibold">
                <span>{schedule.title}</span>
                {!schedule.isAvailable && (
                  <Badge variant="secondary">{m.wizard_coming_soon_badge()}</Badge>
                )}
              </span>
              <small
                className={cn(
                  "block text-sm font-normal",
                  isSelected ? "text-primary-foreground/70" : "text-muted-foreground",
                )}
              >
                {schedule.description}
              </small>
            </>
          );

          const optionClassName =
            "h-auto w-full flex-col items-start gap-0 py-2 text-left whitespace-normal";

          if (!schedule.isAvailable) {
            return (
              <Hint
                key={schedule.value}
                placement="top"
                content={
                  <div id={`schedule-coming-soon-${schedule.value}`}>
                    {m.wizard_schedule_coming_soon_tooltip()}
                  </div>
                }
              >
                <span className="block" tabIndex={0}>
                  <Button variant="outline" className={optionClassName} disabled>
                    {buttonInner}
                  </Button>
                </span>
              </Hint>
            );
          }

          return (
            <Button
              key={schedule.value}
              variant={isSelected ? "default" : "outline"}
              className={optionClassName}
              aria-pressed={isSelected}
              onClick={() => onScheduleChange(schedule.value)}
              ref={schedule.value === "9-5" ? firstButtonRef : undefined}
            >
              {buttonInner}
            </Button>
          );
        })}
      </div>

      <WizardActions
        start={
          <Button variant="outline" size="lg" onClick={onPrev}>
            <Icon icon={isChangeFlow ? XIcon : ArrowLeftIcon} />{" "}
            {isChangeFlow ? m.cancel() : m.back()}
          </Button>
        }
        end={
          <Button size="lg" onClick={onNext} disabled={!selectedSchedule}>
            {continueLabel} <Icon icon={ArrowRightIcon} />
          </Button>
        }
      />
    </>
  );
}
