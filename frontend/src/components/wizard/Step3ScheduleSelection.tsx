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
      <div className="tw:mb-4 tw:text-center">
        <h5 className="tw:mb-2 tw:text-xl tw:font-medium">{m.wizard_schedule_heading()}</h5>
        <p className="tw:text-muted-foreground">{m.wizard_schedule_subtitle()}</p>
      </div>

      <div className="tw:mb-4 tw:flex tw:flex-col tw:gap-2">
        {SCHEDULE_OPTIONS.map((schedule) => {
          const isSelected = selectedSchedule === schedule.value;

          const buttonInner = (
            <>
              <span className="tw:flex tw:items-center tw:gap-2 tw:font-semibold">
                <span>{schedule.title}</span>
                {!schedule.isAvailable && (
                  <Badge variant="secondary">{m.wizard_coming_soon_badge()}</Badge>
                )}
              </span>
              <small
                className={cn(
                  "tw:block tw:text-sm tw:font-normal",
                  isSelected ? "tw:text-primary-foreground/70" : "tw:text-muted-foreground",
                )}
              >
                {schedule.description}
              </small>
            </>
          );

          const optionClassName =
            "tw:h-auto tw:w-full tw:flex-col tw:items-start tw:gap-0 tw:py-2 tw:text-left tw:whitespace-normal";

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
                <span className="tw:block" tabIndex={0}>
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
