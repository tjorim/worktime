import Button from "react-bootstrap/Button";
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
      <div className="text-center mb-4">
        <div className="mb-3">
          <i className="bi bi-clock-history text-primary icon-display" aria-hidden="true"></i>
        </div>
        <p className="lead mb-3">{m.wizard_welcome_lead()}</p>
        <p className="text-muted">{m.wizard_welcome_description()}</p>
      </div>
      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
        <Button
          variant="link"
          onClick={() => {
            if (onDefer) {
              onDefer();
            } else {
              onHide(); // Fallback: close modal and complete onboarding via onHide handler
            }
          }}
          ref={firstButtonRef}
          className="order-2 order-sm-1"
        >
          {m.wizard_maybe_later()}
        </Button>
        <Button variant="primary" onClick={onNext} className="order-1 order-sm-2">
          {m.wizard_get_started()} <i className="bi bi-arrow-right ms-1" aria-hidden="true"></i>
        </Button>
      </div>
      {onSignIn && !isAuthenticated && (
        <div className="text-center mt-3">
          <span className="text-muted small">{m.wizard_welcome_returning_user_prompt()}</span>{" "}
          <Button variant="link" size="sm" className="p-0 align-baseline" onClick={onSignIn}>
            {m.wizard_welcome_returning_user_action()}
          </Button>
        </div>
      )}
    </>
  );
}
