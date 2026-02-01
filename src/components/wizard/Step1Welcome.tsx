import Button from "react-bootstrap/Button";

interface Step1WelcomeProps {
  onDefer?: () => void;
  onHide: () => void;
  onNext: () => void;
  isLoading: boolean;
  firstButtonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function Step1Welcome({
  onDefer,
  onHide,
  onNext,
  isLoading,
  firstButtonRef,
}: Step1WelcomeProps) {
  return (
    <>
      <div className="text-center mb-4">
        <div className="mb-3">
          <i className="bi bi-clock-history text-primary icon-display"></i>
        </div>
        <h4 className="text-primary mb-3">Welcome to Worktime!</h4>
        <p className="lead mb-3">
          Your personal shift tracker and time-off planner, built for flexible schedules
        </p>
        <p className="text-muted">
          Worktime helps you stay on top of your schedule with real-time tracking, countdown timers,
          and integrated time-off management - stored locally in your browser.
        </p>
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
          disabled={isLoading}
          ref={firstButtonRef}
          className="order-2 order-sm-1"
        >
          Maybe Later
        </Button>
        <Button
          variant="primary"
          onClick={onNext}
          disabled={isLoading}
          className="order-1 order-sm-2"
        >
          Let's Get Started! <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
