import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  Check as CheckIcon,
  Timer as TimerIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RefObject } from "react";
import { WizardActions, WizardToggle } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step6TimeTrackingSetupProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onPrev: () => void;
  onComplete: () => void;
  isLastStep?: boolean;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
}

export function Step6TimeTrackingSetup({
  isEnabled,
  onToggle,
  onPrev,
  onComplete,
  isLastStep,
  firstButtonRef,
}: Step6TimeTrackingSetupProps) {
  return (
    <>
      <div className="mb-4 text-center">
        <Icon icon={TimerIcon} className="text-5xl text-success" />
        <h4 className="mt-3 text-2xl font-medium">{m.wizard_tracking_heading()}</h4>
        <p className="text-muted-foreground">{m.wizard_tracking_subtitle()}</p>
      </div>

      <Alert variant="info" className="mt-3">
        <AlertDescription className="text-current">{m.wizard_tracking_info()}</AlertDescription>
      </Alert>

      <WizardToggle
        id="enable-timetracking"
        label={m.wizard_tracking_enable()}
        hint={m.wizard_tracking_disable_hint()}
        checked={isEnabled}
        onCheckedChange={onToggle}
      />

      <WizardActions
        className="mt-4"
        start={
          <Button variant="outline" size="lg" onClick={onPrev} ref={firstButtonRef}>
            <Icon icon={ArrowLeftIcon} /> {m.back()}
          </Button>
        }
        end={
          <Button size="lg" onClick={onComplete}>
            {isLastStep ? m.wizard_finish_setup() : m.continue()}
            <Icon icon={isLastStep ? CheckIcon : ArrowRightIcon} />
          </Button>
        }
      />
    </>
  );
}
