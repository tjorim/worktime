import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import { CountrySelect } from "@/components/shared/CountrySelect";
import type { CountryCode } from "@/types/countries";
import * as m from "@/paraglide/messages.js";

interface SettingsFeaturesSectionProps {
  enableTimeOff: boolean;
  enableTimeTracking: boolean;
  enableGantt: boolean;
  enableCrossBorderTracking: boolean;
  enableUnifiedCalendar: boolean;
  homeCountry: CountryCode | null;
  officeCountry: CountryCode | null;
  onToggleTimeOff: (checked: boolean) => void;
  onToggleTimeTracking: (checked: boolean) => void;
  onToggleGantt: (checked: boolean) => void;
  onToggleCrossBorderTracking: (checked: boolean) => void;
  onToggleUnifiedCalendar: (checked: boolean) => void;
  onUpdateHomeCountry: (country: CountryCode | null) => void;
  onUpdateOfficeCountry: (country: CountryCode | null) => void;
}

export function SettingsFeaturesSection({
  enableTimeOff,
  enableTimeTracking,
  enableGantt,
  enableCrossBorderTracking,
  enableUnifiedCalendar,
  homeCountry,
  officeCountry,
  onToggleTimeOff,
  onToggleTimeTracking,
  onToggleGantt,
  onToggleCrossBorderTracking,
  onToggleUnifiedCalendar,
  onUpdateHomeCountry,
  onUpdateOfficeCountry,
}: SettingsFeaturesSectionProps) {
  return (
    <>
      <div className="border-bottom">
        <div className="p-3">
          <h6 className="text-muted mb-3">
            <i className="bi bi-grid me-2"></i>
            {m.features_title()}
          </h6>
          <ListGroup variant="flush">
            <ListGroup.Item>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-medium">{m.time_off_label()}</div>
                  <small className="text-muted">{m.time_off_description()}</small>
                </div>
                <Form.Check
                  type="switch"
                  id="toggle-timeoff"
                  checked={enableTimeOff}
                  onChange={(event) => onToggleTimeOff(event.target.checked)}
                  aria-label="Toggle time off"
                />
              </div>
            </ListGroup.Item>
            <ListGroup.Item>
              <div className="d-flex flex-column gap-2">
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <div className="fw-medium">{m.time_tracking_label()}</div>
                    <small className="text-muted">{m.time_tracking_description()}</small>
                  </div>
                  <Form.Check
                    type="switch"
                    id="toggle-timetracking"
                    checked={enableTimeTracking}
                    onChange={(event) => onToggleTimeTracking(event.target.checked)}
                    aria-label="Toggle time tracking"
                  />
                </div>
              </div>
            </ListGroup.Item>
            <ListGroup.Item>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-medium">{m.personal_gantt_label()}</div>
                  <small className="text-muted">{m.personal_gantt_description()}</small>
                </div>
                <Form.Check
                  type="switch"
                  id="toggle-gantt"
                  checked={enableGantt}
                  onChange={(event) => onToggleGantt(event.target.checked)}
                  aria-label="Toggle personal gantt"
                />
              </div>
            </ListGroup.Item>
            <ListGroup.Item>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-medium">{m.cross_border_tracking_label()}</div>
                  <small className="text-muted">{m.cross_border_tracking_description()}</small>
                </div>
                <Form.Check
                  type="switch"
                  id="toggle-crossborder"
                  checked={enableCrossBorderTracking}
                  onChange={(event) => onToggleCrossBorderTracking(event.target.checked)}
                  aria-label="Toggle cross-border tracking"
                />
              </div>
            </ListGroup.Item>
            <ListGroup.Item>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-medium">{m.unified_calendar_label()}</div>
                  <small className="text-muted">{m.unified_calendar_description()}</small>
                </div>
                <Form.Check
                  type="switch"
                  id="toggle-unified-calendar"
                  checked={enableUnifiedCalendar}
                  onChange={(event) => onToggleUnifiedCalendar(event.target.checked)}
                  aria-label="Toggle unified calendar"
                />
              </div>
            </ListGroup.Item>
          </ListGroup>
        </div>
      </div>

      {enableCrossBorderTracking && (
        <div className="border-bottom">
          <div className="p-3">
            <h6 className="text-muted mb-3">
              <i className="bi bi-globe me-2"></i>
              {m.cross_border_setup_label()}
            </h6>
            <small className="text-muted d-block mb-3">{m.cross_border_setup_description()}</small>
            <ListGroup variant="flush">
              <ListGroup.Item>
                <div className="d-flex justify-content-between align-items-center gap-3">
                  <div>
                    <div className="fw-medium">{m.home_country_label()}</div>
                    <small className="text-muted">{m.home_country_description()}</small>
                  </div>
                  <div style={{ minWidth: "12rem" }}>
                    <CountrySelect
                      value={homeCountry}
                      onChange={onUpdateHomeCountry}
                      ariaLabel={m.home_country_label()}
                    />
                  </div>
                </div>
              </ListGroup.Item>
              <ListGroup.Item>
                <div className="d-flex justify-content-between align-items-center gap-3">
                  <div>
                    <div className="fw-medium">{m.office_country_label()}</div>
                    <small className="text-muted">{m.office_country_description()}</small>
                  </div>
                  <div style={{ minWidth: "12rem" }}>
                    <CountrySelect
                      value={officeCountry}
                      onChange={onUpdateOfficeCountry}
                      ariaLabel={m.office_country_label()}
                    />
                  </div>
                </div>
              </ListGroup.Item>
            </ListGroup>
          </div>
        </div>
      )}
    </>
  );
}
