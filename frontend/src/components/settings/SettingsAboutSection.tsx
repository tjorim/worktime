import ListGroup from "react-bootstrap/ListGroup";
import * as m from "@/paraglide/messages.js";
import { SettingsBackendStatus } from "@/components/settings/SettingsBackendStatus";

interface SettingsAboutSectionProps {
  onShareApp: () => void;
  canInstallApp: boolean;
  isAppInstalled: boolean;
  onInstallApp: () => void;
  onShowChangelog: () => void;
  onShowAboutHelp: () => void;
  onShowShortcuts: () => void;
}

export function SettingsAboutSection({
  onShareApp,
  canInstallApp,
  isAppInstalled,
  onInstallApp,
  onShowChangelog,
  onShowAboutHelp,
  onShowShortcuts,
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
          <ListGroup.Item action onClick={onShareApp}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-share me-2"></i>
                  {m.share_app_label()}
                </div>
                <small className="text-muted">{m.share_app_description()}</small>
              </div>
              <i className="bi bi-share text-muted"></i>
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onInstallApp} disabled={!canInstallApp}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <i className="bi bi-phone me-2"></i>
                  {isAppInstalled ? m.pwa_install_installed_label() : m.pwa_install_app_label()}
                </div>
                <small className="text-muted">
                  {isAppInstalled
                    ? m.pwa_install_installed_description()
                    : canInstallApp
                      ? m.pwa_install_app_description()
                      : m.pwa_install_unavailable_description()}
                </small>
              </div>
              {isAppInstalled ? (
                <i className="bi bi-check-circle-fill text-success"></i>
              ) : (
                <i className="bi bi-chevron-right text-muted"></i>
              )}
            </div>
          </ListGroup.Item>
          <SettingsBackendStatus />
        </ListGroup>
      </div>
    </div>
  );
}
