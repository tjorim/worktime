import { useState } from "react";
import Badge from "react-bootstrap/Badge";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import ListGroup from "react-bootstrap/ListGroup";
import Offcanvas from "react-bootstrap/Offcanvas";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { CONFIG } from "../utils/config";
import { shareApp, shareTodayView } from "../utils/share";
import { ChangelogModal } from "./ChangelogModal";

interface SettingsPanelProps {
  show: boolean;
  onHide: () => void;
  onShowAbout?: () => void;
  onChangeSchedule?: () => void;
}

/**
 * Render the settings sidebar with preferences, information and quick actions.
 *
 * @param show - Whether the settings panel is visible
 * @param onHide - Callback invoked to hide the settings panel
 * @param onShowAbout - Optional callback invoked to show the About modal
 * @param onChangeSchedule - Optional callback invoked when the user wants to change the schedule
 * @returns The rendered settings panel element
 */
export function SettingsPanel({ show, onHide, onShowAbout, onChangeSchedule }: SettingsPanelProps) {
  const [showChangelog, setShowChangelog] = useState(false);
  const toast = useToast();
  const { settings, updateTimeFormat, updateTheme, resetSettings } = useSettings();

  const handleChangelogClick = () => {
    setShowChangelog(true);
  };

  const handleChangelogClose = () => {
    setShowChangelog(false);
  };

  // Clear/reset all settings
  const handleClearData = () => {
    try {
      resetSettings();
      onHide(); // Close the settings panel
      toast.showSuccess("All data cleared", "🗑️");
    } catch (error) {
      console.error("Failed to clear data:", error);
      toast.showError("Could not clear all data. Please try again.", "⚠️");
    }
  };

  // Open About modal through callback prop
  const handleAboutHelpClick = () => {
    onShowAbout?.();
  };

  const handleChangeSchedule = () => {
    // Close first to avoid stacked overlays if the callback opens another UI surface
    onHide();
    onChangeSchedule?.();
  };

  // Share handlers
  const handleShareApp = () => {
    shareApp(
      () => toast?.showSuccess("Share dialog opened or link copied!"),
      () => toast?.showError("Could not share. Try copying the link manually."),
    );
  };
  const handleShareWithContext = () => {
    shareTodayView(
      () => toast?.showSuccess("Share dialog opened or link copied!"),
      () => toast?.showError("Could not share. Try copying the link manually."),
    );
  };

  return (
    <>
      <Offcanvas show={show} onHide={onHide} placement="end">
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>
            <i className="bi bi-gear me-2"></i>
            Settings
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          {/* App Preferences Section */}
          <div className="border-bottom">
            <div className="p-3">
              <h6 className="text-muted mb-3">
                <i className="bi bi-sliders me-2"></i>
                Preferences
              </h6>
              <ListGroup variant="flush">
                <ListGroup.Item className="">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">Time Format</div>
                      <small className="text-muted">24-hour or 12-hour display</small>
                    </div>
                    <ButtonGroup size="sm">
                      <Button
                        variant={settings.timeFormat === "24h" ? "primary" : "outline-secondary"}
                        onClick={() => updateTimeFormat("24h")}
                      >
                        24h
                      </Button>
                      <Button
                        variant={settings.timeFormat === "12h" ? "primary" : "outline-secondary"}
                        onClick={() => updateTimeFormat("12h")}
                      >
                        12h
                      </Button>
                    </ButtonGroup>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item className="">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">Theme</div>
                      <small className="text-muted">App appearance</small>
                    </div>
                    <ButtonGroup size="sm">
                      <Button
                        variant={settings.theme === "auto" ? "primary" : "outline-secondary"}
                        onClick={() => updateTheme("auto")}
                      >
                        <i className="bi bi-circle-half me-1"></i>
                        Auto
                      </Button>
                      <Button
                        variant={settings.theme === "light" ? "primary" : "outline-secondary"}
                        onClick={() => updateTheme("light")}
                      >
                        <i className="bi bi-sun me-1"></i>
                        Light
                      </Button>
                      <Button
                        variant={settings.theme === "dark" ? "primary" : "outline-secondary"}
                        onClick={() => updateTheme("dark")}
                      >
                        <i className="bi bi-moon me-1"></i>
                        Dark
                      </Button>
                    </ButtonGroup>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item className="">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium text-muted">
                        Notifications
                        <Badge bg="secondary" className="ms-2 small">
                          Coming Soon
                        </Badge>
                      </div>
                      <small className="text-muted">Shift reminders and alerts</small>
                    </div>
                    <ButtonGroup size="sm">
                      <Button variant="outline-secondary" disabled>
                        <i className="bi bi-bell me-1"></i>
                        On
                      </Button>
                      <Button variant="secondary" disabled>
                        <i className="bi bi-bell-slash me-1"></i>
                        Off
                      </Button>
                    </ButtonGroup>
                  </div>
                </ListGroup.Item>
              </ListGroup>
            </div>
          </div>

          {/* Information Section */}
          <div className="border-bottom">
            <div className="p-3">
              <h6 className="text-muted mb-3">
                <i className="bi bi-info-circle me-2"></i>
                Information
              </h6>
              <ListGroup variant="flush">
                <ListGroup.Item action onClick={handleChangelogClick}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-stars me-2"></i>
                        What's New
                      </div>
                      <small className="text-muted">Recent updates and changes</small>
                    </div>
                    <i className="bi bi-chevron-right text-muted"></i>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item action onClick={handleAboutHelpClick}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-question-circle me-2"></i>
                        About & Help
                      </div>
                      <small className="text-muted">Version info, user guide, and support</small>
                    </div>
                    <i className="bi bi-chevron-right text-muted"></i>
                  </div>
                </ListGroup.Item>
              </ListGroup>
            </div>
          </div>

          {/* Quick Actions Section */}
          <div>
            <div className="p-3">
              <h6 className="text-muted mb-3">
                <i className="bi bi-lightning me-2"></i>
                Quick Actions
              </h6>
              <ListGroup variant="flush">
                {onChangeSchedule && (
                  <ListGroup.Item action onClick={handleChangeSchedule}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-medium">
                          <i className="bi bi-calendar-week me-2"></i>
                          Change Schedule
                        </div>
                        <small className="text-muted">Pick a different roster</small>
                      </div>
                      <i className="bi bi-chevron-right text-muted"></i>
                    </div>
                  </ListGroup.Item>
                )}
                <ListGroup.Item action disabled>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-calendar-event me-2"></i>
                        Export Schedule{" "}
                        <Badge bg="secondary" className="ms-2">
                          Coming Soon
                        </Badge>
                      </div>
                      <small className="text-muted">Download as calendar file</small>
                    </div>
                    <i className="bi bi-chevron-right text-muted"></i>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item action onClick={handleShareApp}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-share me-2"></i>
                        Share App
                      </div>
                      <small className="text-muted">Send Worktime to colleagues</small>
                    </div>
                    <i className="bi bi-share text-muted"></i>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item action onClick={handleShareWithContext}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-link-45deg me-2"></i>
                        Share This View
                      </div>
                      <small className="text-muted">Share with current context</small>
                    </div>
                    <i className="bi bi-share-fill text-muted"></i>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item action onClick={handleClearData} className="text-danger">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-trash me-2"></i>
                        Reset Settings
                      </div>
                      <small className="text-muted">Clear all preferences and data</small>
                    </div>
                    <i className="bi bi-arrow-clockwise text-danger"></i>
                  </div>
                </ListGroup.Item>
              </ListGroup>
            </div>
          </div>

          {/* App Version Footer */}
          <div className="mt-auto p-3 text-center border-top">
            <small className="text-muted d-block">Worktime v{CONFIG.VERSION}</small>
            <small className="text-muted">Built with ❤️ by Jorim Tielemans</small>
          </div>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Changelog Modal */}
      <ChangelogModal show={showChangelog} onHide={handleChangelogClose} />
    </>
  );
}
