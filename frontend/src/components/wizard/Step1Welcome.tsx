import { ArrowRight as ArrowRightIcon, History as HistoryIcon } from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { Button } from "@/components/ui/button";
import { WizardActions } from "./WizardParts";
import * as m from "@/paraglide/messages.js";

interface Step1WelcomeProps {
  onDefer?: () => void;
  onHide: () => void;
  onNext: () => void;
  /** Optional "returning user" sign-in entry point, shown only when provided and not already authenticated. */
  onSignIn?: () => void;
  isAuthenticated?: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step1Welcome({
  onDefer,
  onHide,
  onNext,
  onSignIn,
  isAuthenticated,
  firstButtonRef,
}: Step1WelcomeProps) {
  return (
    <>
      <div className="tw:mb-4 tw:text-center">
        <div className="tw:mb-3">
          <Icon icon={HistoryIcon} className="tw:text-5xl tw:text-primary" />
        </div>
        <p className="tw:mb-3 tw:text-xl tw:font-light">{m.wizard_welcome_lead()}</p>
        <p className="tw:text-muted-foreground">{m.wizard_welcome_description()}</p>
      </div>
      <WizardActions
        start={
          <Button
            variant="link"
            size="lg"
            onClick={() => {
              if (onDefer) {
                onDefer();
              } else {
                onHide(); // Fallback: close modal and complete onboarding via onHide handler
              }
            }}
            ref={firstButtonRef}
          >
            {m.wizard_maybe_later()}
          </Button>
        }
        end={
          <Button size="lg" onClick={onNext}>
            {m.wizard_get_started()} <Icon icon={ArrowRightIcon} />
          </Button>
        }
      />
      {onSignIn && !isAuthenticated && (
        <div className="tw:mt-3 tw:text-center">
          <span className="tw:text-sm tw:text-muted-foreground">
            {m.wizard_welcome_returning_user_prompt()}
          </span>{" "}
          <Button
            variant="link"
            className="tw:h-auto tw:p-0 tw:align-baseline tw:text-sm"
            onClick={onSignIn}
          >
            {m.wizard_welcome_returning_user_action()}
          </Button>
        </div>
      )}
    </>
  );
}
