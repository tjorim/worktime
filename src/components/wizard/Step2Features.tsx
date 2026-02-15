import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import type { ReactNode, RefObject } from "react";

interface Step2FeaturesProps {
  onPrev: () => void;
  onNext: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * Text or element describing where to find settings. Caller is responsible for any desired styling (e.g., <b> or <strong> if bold is needed).
   */
  settingsLocationText: ReactNode;
}

export function Step2Features({
  onPrev,
  onNext,
  firstButtonRef,
  settingsLocationText,
}: Step2FeaturesProps) {
  return (
    <>
      <div className="mb-4">
        <h5 className="text-center mb-4">Here's what Worktime can do for you:</h5>
        <Row className="g-3">
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-stopwatch text-success me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">Live Countdown Timers</h6>
                <small className="text-muted">Know exactly when your next shift starts</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-wifi-off text-info me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">Local-First Data</h6>
                <small className="text-muted">
                  Your settings and events are saved in your browser for quick access
                </small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-people text-warning me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">Team Overview</h6>
                <small className="text-muted">See who is working across your schedule</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-calendar-check text-primary me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">Time-Off Planning</h6>
                <small className="text-muted">Track vacation and time-off with .hday files</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-stopwatch text-success me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">Time Tracking</h6>
                <small className="text-muted">Log tasks and review weekly summaries</small>
              </div>
            </div>
          </Col>
        </Row>
        <Alert variant="info" className="mt-4">
          <i className="bi bi-gear me-2"></i>
          <strong>Tip:</strong> You can customize your experience anytime in the {settingsLocationText}.
        </Alert>
      </div>
      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
        <Button
          variant="outline-secondary"
          onClick={onPrev}
          ref={firstButtonRef}
          className="order-2 order-sm-1"
        >
          <i className="bi bi-arrow-left me-1"></i> Back
        </Button>
        <Button variant="primary" onClick={onNext} className="order-1 order-sm-2">
          Choose a Schedule <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
