import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  CalendarCheck as CalendarCheckIcon,
  ChartGantt as ChartGanttIcon,
  Globe as GlobeIcon,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Timer as TimerIcon,
  Users as UsersIcon,
  WifiOff as WifiOffIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import Alert from "react-bootstrap/Alert";
import Button from "react-bootstrap/Button";
import Col from "react-bootstrap/Col";
import Row from "react-bootstrap/Row";
import type { RefObject } from "react";
import * as m from "@/paraglide/messages.js";

interface Step2FeaturesProps {
  onPrev: () => void;
  onNext: () => void;
  firstButtonRef?: RefObject<HTMLButtonElement | null>;
  /**
   * String describing where to find settings; caller is responsible for any desired styling.
   */
  settingsLocationText: string;
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
              <Icon icon={TimerIcon} className="text-success me-3 mt-1 icon-feature" />
              <div>
                <h6 className="mb-1">{m.wizard_feature_countdown_title()}</h6>
                <small className="text-muted">{m.wizard_feature_countdown_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <Icon icon={WifiOffIcon} className="text-info me-3 mt-1 icon-feature" />
              <div>
                <h6 className="mb-1">{m.wizard_feature_local_title()}</h6>
                <small className="text-muted">{m.wizard_feature_local_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <Icon icon={UsersIcon} className="text-warning me-3 mt-1 icon-feature" />
              <div>
                <h6 className="mb-1">{m.wizard_feature_team_title()}</h6>
                <small className="text-muted">{m.wizard_feature_team_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <Icon icon={CalendarCheckIcon} className="text-primary me-3 mt-1 icon-feature" />
              <div>
                <h6 className="mb-1">{m.wizard_feature_timeoff_title()}</h6>
                <small className="text-muted">{m.wizard_feature_timeoff_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <Icon icon={HistoryIcon} className="text-success me-3 mt-1 icon-feature" />
              <div>
                <h6 className="mb-1">{m.wizard_feature_tracking_title()}</h6>
                <small className="text-muted">{m.wizard_feature_tracking_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <Icon icon={ChartGanttIcon} className="text-warning me-3 mt-1 icon-feature" />
              <div>
                <h6 className="mb-1">{m.wizard_feature_gantt_title()}</h6>
                <small className="text-muted">{m.wizard_feature_gantt_desc()}</small>
              </div>
            </div>
          </Col>
          <Col xs={12} md={6}>
            <div className="d-flex align-items-start">
              <Icon icon={GlobeIcon} className="text-primary me-3 mt-1 icon-feature" />
              <div>
                <h6 className="mb-1">{m.wizard_feature_crossborder_title()}</h6>
                <small className="text-muted">{m.wizard_feature_crossborder_desc()}</small>
              </div>
            </div>
          </Col>
        </Row>
        <Alert variant="info" className="mt-4">
          <Icon icon={SettingsIcon} className="me-2" />
          {m.wizard_features_tip_full({ settingsLocation: settingsLocationText })}
        </Alert>
      </div>
      <div className="d-flex flex-column flex-sm-row justify-content-between gap-2">
        <Button
          variant="outline-secondary"
          onClick={onPrev}
          ref={firstButtonRef}
          className="order-2 order-sm-1"
        >
          <Icon icon={ArrowLeftIcon} className="me-1" /> {m.back()}
        </Button>
        <Button variant="primary" onClick={onNext} className="order-1 order-sm-2">
          {m.wizard_choose_schedule_btn()} <Icon icon={ArrowRightIcon} className="ms-1" />
        </Button>
      </div>
    </>
  );
}
