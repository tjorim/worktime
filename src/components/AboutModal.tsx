import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Modal from "react-bootstrap/Modal";
import Row from "react-bootstrap/Row";
import { useSettings } from "../contexts/SettingsContext";
import { CONFIG } from "../utils/config";
import { getScheduleConfig } from "../utils/scheduleUtils";

interface AboutModalProps {
  show: boolean;
  onHide: () => void;
}

/**
 * Render the About modal for Worktime with version, features, support links and credits.
 *
 * @param show - Whether the modal is visible
 * @param onHide - Callback invoked when the modal should be closed
 * @returns The React element for the About modal
 */
export function AboutModal({ show, onHide }: AboutModalProps) {
  const { scheduleType } = useSettings();
  const scheduleConfig = getScheduleConfig(scheduleType);
  const isFiveShift = scheduleConfig.value === "5-shift";

  return (
    <Modal show={show} onHide={onHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>
          <i className="bi bi-info-circle me-2"></i>
          About Worktime
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {/* App Title & Version */}
        <div className="text-center mb-4">
          <div className="mb-2">
            <i className="bi bi-clock-history text-primary" style={{ fontSize: "2rem" }}></i>
          </div>
          <h5 className="mb-2">Worktime - Shift Tracker & Time Off</h5>
          <div className="mb-2">
            <Badge bg="primary">
              <i className="bi bi-tag me-1"></i>Version {CONFIG.VERSION}
            </Badge>
          </div>
        </div>

        {/* Author Section */}
        <div className="text-center mb-4">
          <div className="d-flex justify-content-center align-items-center gap-2 mb-2">
            <i className="bi bi-person-circle text-muted"></i>
            <span className="fw-semibold">Created by Jorim Tielemans</span>
          </div>
          <a
            href="https://github.com/tjorim"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-outline-primary btn-sm"
          >
            <i className="bi bi-github me-1"></i>GitHub Profile
          </a>
        </div>

        <hr />

        {/* Features List with Icons */}
        <div className="mb-4">
          <h6 className="mb-3">
            <i className="bi bi-star me-2 text-warning"></i>Key Features
          </h6>
          <Row className="g-2">
            {isFiveShift ? (
              <Col xs={6}>
                <div className="d-flex align-items-center small">
                  <i className="bi bi-people text-primary me-2"></i>
                  <span>5-team shift tracking</span>
                </div>
              </Col>
            ) : (
              <Col xs={6}>
                <div className="d-flex align-items-center small">
                  <i className="bi bi-calendar2-week text-primary me-2"></i>
                  <span>Schedule type: {scheduleConfig.title}</span>
                </div>
              </Col>
            )}
            <Col xs={6}>
              <div className="d-flex align-items-center small">
                <i className="bi bi-file-earmark-text text-success me-2"></i>
                <span>.hday time-off files</span>
              </div>
            </Col>
            {isFiveShift && (
              <Col xs={6}>
                <div className="d-flex align-items-center small">
                  <i className="bi bi-arrow-left-right text-info me-2"></i>
                  <span>Transfer detection</span>
                </div>
              </Col>
            )}
            <Col xs={6}>
              <div className="d-flex align-items-center small">
                <i className="bi bi-calendar-date text-secondary me-2"></i>
                <span>YYWW.D date format</span>
              </div>
            </Col>
            {!isFiveShift && (
              <Col xs={6}>
                <div className="d-flex align-items-center small">
                  <i className="bi bi-clock-history text-info me-2"></i>
                  <span>More schedule views coming soon</span>
                </div>
              </Col>
            )}
          </Row>
        </div>

        <hr />

        {/* Quick Links */}
        <div className="mb-4">
          <h6 className="mb-3">
            <i className="bi bi-link-45deg me-2 text-info"></i>
            Quick Links
          </h6>
          <div className="d-grid gap-2">
            <Row className="g-2">
              <Col xs={6}>
                <a
                  href="https://github.com/tjorim/worktime#readme"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary btn-sm w-100"
                >
                  <i className="bi bi-book me-1"></i>
                  Documentation
                </a>
              </Col>
              <Col xs={6}>
                <a
                  href="https://github.com/tjorim/worktime"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-secondary btn-sm w-100"
                >
                  <i className="bi bi-code-slash me-1"></i>
                  Source Code
                </a>
              </Col>
            </Row>
          </div>
        </div>

        {/* Support Section */}
        <div className="mb-4">
          <h6 className="mb-3">
            <i className="bi bi-headset me-2 text-success"></i>
            Support & Feedback
          </h6>
          <div className="d-grid gap-2">
            <Row className="g-2">
              <Col xs={6}>
                <a
                  href="https://github.com/tjorim/worktime/issues/new?template=bug_report.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-danger btn-sm w-100"
                >
                  <i className="bi bi-bug me-1"></i>Report Bug
                </a>
              </Col>
              <Col xs={6}>
                <a
                  href="https://github.com/tjorim/worktime/issues/new?template=feature_request.yml"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-outline-success btn-sm w-100"
                >
                  <i className="bi bi-lightbulb me-1"></i>
                  Request Feature
                </a>
              </Col>
            </Row>
          </div>
        </div>

        {/* Footer Info */}
        <div className="text-center">
          <div className="d-flex justify-content-center align-items-center gap-3 small text-muted">
            <span>
              <i className="bi bi-shield-check me-1"></i>
              Apache 2.0
            </span>
            <span>
              <i className="bi bi-code-square me-1"></i>React + TypeScript
            </span>
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
