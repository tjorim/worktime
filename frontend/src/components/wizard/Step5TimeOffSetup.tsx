import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  CalendarCheck as CalendarCheckIcon,
  Check as CheckIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RefObject } from "react";
import { WizardActions, WizardToggle } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step5TimeOffSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPrev: () => void;
  onNext: () => void;
  isLastStep?: boolean;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step5TimeOffSetup({
  isEnabled,
  onToggle,
  onPrev,
  onNext,
  isLastStep,
  firstButtonRef,
}: Step5TimeOffSetupProps) {
  return (
    <>
      <div className="tw:mb-4 tw:text-center">
        <Icon icon={CalendarCheckIcon} className="tw:text-5xl tw:text-primary" />
        <h4 className="tw:mt-3 tw:text-2xl tw:font-medium">{m.wizard_timeoff_heading()}</h4>
        <p className="tw:text-muted-foreground">{m.wizard_timeoff_subtitle()}</p>
      </div>

      <Alert variant="info" className="tw:mt-3">
        <AlertDescription className="tw:text-current">
          <ul className="tw:list-disc tw:pl-5">
            <li>{m.wizard_timeoff_benefit1()}</li>
            <li>{m.wizard_timeoff_benefit2()}</li>
            <li>{m.wizard_timeoff_benefit3()}</li>
          </ul>
        </AlertDescription>
      </Alert>

      <WizardToggle
        id="enable-timeoff"
        label={m.wizard_timeoff_enable()}
        hint={m.wizard_timeoff_disable_hint()}
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
