import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  ChartGantt as ChartGanttIcon,
  Check as CheckIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RefObject } from "react";
import { WizardActions, WizardToggle } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step7GanttSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  isLastStep?: boolean;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step7GanttSetup({
  isEnabled,
  onToggle,
  onPrev,
  onNext,
  isLastStep,
  firstButtonRef,
}: Step7GanttSetupProps) {
  return (
    <>
      <div className="tw:mb-4 tw:text-center">
        <Icon icon={ChartGanttIcon} className="tw:text-5xl tw:text-warning" />
        <h4 className="tw:mt-3 tw:text-2xl tw:font-medium">{m.wizard_gantt_heading()}</h4>
        <p className="tw:text-muted-foreground">{m.wizard_gantt_subtitle()}</p>
      </div>

      <Alert variant="info" className="tw:mt-3">
        <AlertDescription className="tw:text-current">{m.wizard_gantt_info()}</AlertDescription>
      </Alert>

      <WizardToggle
        id="enable-gantt"
        label={m.wizard_gantt_enable()}
        hint={m.wizard_gantt_disable_hint()}
        checked={isEnabled}
        onCheckedChange={onToggle}
      />

      <WizardActions
        className="tw:mt-4"
        start={
          <Button variant="outline" size="lg" onClick={onPrev} ref={firstButtonRef}>
            <Icon icon={ArrowLeftIcon} /> {m.back()}
          </Button>
        }
        end={
          <Button size="lg" onClick={onNext}>
            {isLastStep ? m.wizard_finish_setup() : m.continue()}
            <Icon icon={isLastStep ? CheckIcon : ArrowRightIcon} />
          </Button>
        }
      />
    </>
  );
}
