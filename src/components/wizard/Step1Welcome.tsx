import Button from "react-bootstrap/Button";
import * as m from "../../paraglide/messages.js";

interface Step1WelcomeProps {
  onDefer?: () => void;
  onHide: () => void;
  onNext: () => void;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step1Welcome({ onDefer, onHide, onNext, firstButtonRef }: Step1WelcomeProps) {
  return (
    <>
      <div className="text-center mb-4">
        <div className="mb-3">
          <i className="bi bi-clock-history text-primary icon-display"></i>
        </div>
        <h4 className="text-primary mb-3">{m.wizard_welcome_title()}</h4>
        <p className="lead mb-3">{m.wizard_welcome_lead()}</p>
        <p className="text-muted">{m.wizard_welcome_description()}</p>
      </div>
      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
        <Button
          variant="outline-secondary"
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
          {m.wizard_get_started()} <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
