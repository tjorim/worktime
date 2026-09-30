import {
  ChevronRight as ChevronRightIcon,
  CircleCheck as CircleCheckIcon,
  CircleHelp as CircleHelpIcon,
  Info as InfoIcon,
  Keyboard as KeyboardIcon,
  Share as ShareIcon,
  Smartphone as SmartphoneIcon,
  Sparkles as SparklesIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
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
        <h6 className="tw:text-muted-foreground mb-3">
          <Icon icon={InfoIcon} className="me-2" />
          {m.information_title()}
        </h6>
        <ListGroup variant="flush">
          <ListGroup.Item action onClick={onShowChangelog}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={SparklesIcon} className="me-2" />
                  {m.whats_new_label()}
                </div>
                <small className="text-muted">{m.whats_new_description()}</small>
              </div>
              <Icon icon={ChevronRightIcon} className="text-muted" />
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onShowAboutHelp}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={CircleHelpIcon} className="me-2" />
                  {m.about_help_label()}
                </div>
                <small className="text-muted">{m.about_help_description()}</small>
              </div>
              <Icon icon={ChevronRightIcon} className="text-muted" />
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onShowShortcuts}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={KeyboardIcon} className="me-2" />
                  {m.keyboard_shortcuts_label()}
                </div>
                <small className="text-muted">{m.keyboard_shortcuts_description()}</small>
              </div>
              <Icon icon={ChevronRightIcon} className="text-muted" />
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onShareApp}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={ShareIcon} className="me-2" />
                  {m.share_app_label()}
                </div>
                <small className="text-muted">{m.share_app_description()}</small>
              </div>
              <Icon icon={ShareIcon} className="text-muted" />
            </div>
          </ListGroup.Item>
          <ListGroup.Item action onClick={onInstallApp} disabled={!canInstallApp}>
            <div className="d-flex justify-content-between align-items-center">
              <div>
                <div className="fw-medium">
                  <Icon icon={SmartphoneIcon} className="me-2" />
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
                <Icon icon={CircleCheckIcon} className="text-success" />
              ) : (
                <Icon icon={ChevronRightIcon} className="text-muted" />
              )}
            </div>
          </ListGroup.Item>
          <SettingsBackendStatus />
        </ListGroup>
      </div>
    </div>
  );
}
