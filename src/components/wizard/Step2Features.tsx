import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import type { ReactNode, RefObject } from "react";
import * as m from "../../paraglide/messages.js";

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
        <h5 className="text-center mb-4">{m.wizard_features_heading()}</h5>
        <Row className="g-3">
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-stopwatch text-success me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_feature_countdown_title()}</h6>
                <small className="text-muted">{m.wizard_feature_countdown_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-wifi-off text-info me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_feature_local_title()}</h6>
                <small className="text-muted">{m.wizard_feature_local_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-people text-warning me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_feature_team_title()}</h6>
                <small className="text-muted">{m.wizard_feature_team_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-calendar-check text-primary me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_feature_timeoff_title()}</h6>
                <small className="text-muted">{m.wizard_feature_timeoff_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-clock-history text-success me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_feature_tracking_title()}</h6>
                <small className="text-muted">{m.wizard_feature_tracking_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-bar-chart-steps text-warning me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_feature_gantt_title()}</h6>
                <small className="text-muted">{m.wizard_feature_gantt_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <i className="bi bi-globe text-primary me-3 mt-1 icon-feature"></i>
              <div>
                <h6 className="mb-1">{m.wizard_feature_crossborder_title()}</h6>
                <small className="text-muted">{m.wizard_feature_crossborder_desc()}</small>
              </div>
            </div>
          </Col>
        </Row>
        <Alert variant="info" className="mt-4">
          <i className="bi bi-gear me-2"></i>
          <strong>{m.wizard_features_tip_label()}</strong> {m.wizard_features_customize_prefix()}{" "}
          {settingsLocationText}.
        </Alert>
      </div>
      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
        <Button
          variant="outline-secondary"
          onClick={onPrev}
          ref={firstButtonRef}
          className="order-2 order-sm-1"
        >
          <i className="bi bi-arrow-left me-1"></i> {m.back()}
        </Button>
        <Button variant="primary" onClick={onNext} className="order-1 order-sm-2">
          {m.wizard_choose_schedule_btn()} <i className="bi bi-arrow-right ms-1"></i>
        </Button>
      </div>
    </>
  );
}
