import ListGroup from "react-bootstrap/ListGroup";
import * as m from "@/paraglide/messages.js";

interface SettingsAboutSectionProps {
  isDevMode: boolean;
  onShowChangelog: () => void;
  onShowAboutHelp: () => void;
  onShowShortcuts: () => void;
  onShowDevOptions: () => void;
}

export function SettingsAboutSection({
  isDevMode,
  onShowChangelog,
  onShowAboutHelp,
  onShowShortcuts,
  onShowDevOptions,
}: SettingsAboutSectionProps) {
  return (
    <div className="border-bottom">
      <div className="p-3">
        <h6 className="text-muted mb-3">
          <i className="bi bi-info-circle me-2"></i>
          {m.information_title()}
        </h6>
        <ListGroup variant="flush">
          <ListGroup.Item action onClick={onShowChangelog}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-stars me-2"></i>
                  {m.whats_new_label()}
                </div>
                <small className="text-muted">{m.whats_new_description()}</small>
              </div>
              <i className="bi bi-chevron-right text-muted"></i>
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onShowAboutHelp}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-question-circle me-2"></i>
                  {m.about_help_label()}
                </div>
                <small className="text-muted">{m.about_help_description()}</small>
              </div>
              <i className="bi bi-chevron-right text-muted"></i>
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onShowShortcuts}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-keyboard me-2"></i>
                  {m.keyboard_shortcuts_label()}
                </div>
                <small className="text-muted">{m.keyboard_shortcuts_description()}</small>
              </div>
              <i className="bi bi-chevron-right text-muted"></i>
            </div>
          </ListGroup.Item>
          {isDevMode && (
            <ListGroup.Item action onClick={onShowDevOptions}>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-medium">
                    <i className="bi bi-code-slash me-2"></i>
                    {m.developer_options_label()}
                  </div>
                  <small className="text-muted">{m.developer_options_description()}</small>
                </div>
                <i className="bi bi-chevron-right text-muted"></i>
              </div>
            </ListGroup.Item>
          )}
        </ListGroup>
      </div>
    </div>
  );
}
