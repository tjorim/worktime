import { useState } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Offcanvas from "react-bootstrap/Offcanvas";
import Alert from "react-bootstrap/Alert";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { useEventStore, TIME_OFF_STORAGE_KEY } from "../contexts/EventStoreContext";
import { useDeveloperOptions } from "../contexts/DeveloperOptionsContext";
import { CONFIG } from "../utils/config";
import { hasMultipleTeams } from "../utils/scheduleUtils";
import { shareApp } from "../utils/share";
import { ChangelogModal } from "./ChangelogModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { DevOptionsPanel } from "./DevOptionsPanel";
import { TIME_TRACKING_STORAGE_KEYS } from "./timeTracking/constants";

interface SettingsPanelProps {
  show: boolean;
  onHide: () => void;
  onShowAbout?: () => void;
  onChangeSchedule?: () => void;
  onChangeTeam?: () => void;
}

/**
 * Render the settings sidebar with preferences, information and quick actions.
 *
 * @param show - Whether the settings panel is visible
 * @param onHide - Callback invoked to hide the settings panel
 * @param onShowAbout - Optional callback invoked to show the About modal
 * @param onChangeSchedule - Optional callback invoked when the user wants to change the schedule
 * @param onChangeTeam - Optional callback invoked when the user wants to change their team
 * @returns The rendered settings panel element
 */
export function SettingsPanel({
  show,
  onHide,
  onShowAbout,
  onChangeSchedule,
  onChangeTeam,
}: SettingsPanelProps) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [clearTimeTrackingData, setClearTimeTrackingData] = useState(false);
  const [clearTimeOffData, setClearTimeOffData] = useState(false);
  const [versionClickCount, setVersionClickCount] = useState(0);
  const toast = useToast();
  const { clearAll: clearTimeOffEvents } = useEventStore();
  const { isDevMode, toggleDevMode } = useDeveloperOptions();
  const {
    settings,
    scheduleType,
    updateTimeFormat,
    updateTheme,
    updateTimeOffEnabled,
    updateTimeTrackingEnabled,
    resetSettings,
  } = useSettings();

  const handleChangelogClick = () => {
    setShowChangelog(true);
  };

  const handleChangelogClose = () => {
    setShowChangelog(false);
  };

  const handleShortcutsClick = () => {
    setShowShortcuts(true);
  };

  const handleShortcutsClose = () => {
    setShowShortcuts(false);
  };

  const handleDevOptionsClick = () => {
    setShowDevOptions(true);
  };

  const handleDevOptionsClose = () => {
    setShowDevOptions(false);
  };

  // Triple-click on version to toggle dev mode
  const handleVersionClick = () => {
    setVersionClickCount((prev) => prev + 1);
    setTimeout(() => setVersionClickCount(0), 1000); // Reset after 1 second

    if (versionClickCount === 2) {
      // Third click
      toggleDevMode();
      const message = isDevMode
        ? "Developer mode disabled"
        : "Developer mode enabled - check Information section";
      toast.showInfo(message);
      setVersionClickCount(0);
    }
  };

  // Clear/reset all settings
  const handleClearData = () => {
    setShowResetConfirm(true);
  };

  const handleCloseResetModal = () => {
    setShowResetConfirm(false);
    setClearTimeTrackingData(false);
    setClearTimeOffData(false);
  };

  const handleConfirmReset = () => {
    let settingsCleared = false;
    let timeTrackingCleared = false;
    let timeOffCleared = false;
    const errors: string[] = [];

    // Attempt settings reset
    try {
      resetSettings();
      settingsCleared = true;
    } catch (error) {
      console.error("Failed to reset settings:", error);
      errors.push("settings");
    }

    // Attempt time tracking data clearing if requested
    if (clearTimeTrackingData) {
      try {
        localStorage.removeItem(TIME_TRACKING_STORAGE_KEYS.tasks);
        localStorage.removeItem(TIME_TRACKING_STORAGE_KEYS.templates);
        localStorage.removeItem(TIME_TRACKING_STORAGE_KEYS.labels);
        timeTrackingCleared = true;
      } catch (error) {
        console.error("Failed to clear time tracking data:", error);
        errors.push("time tracking data");
      }
    }

    // Attempt time off data clearing if requested
    if (clearTimeOffData) {
      try {
        clearTimeOffEvents();
        localStorage.removeItem(TIME_OFF_STORAGE_KEY);
        timeOffCleared = true;
      } catch (error) {
        console.error("Failed to clear time off data:", error);
        errors.push("time off data");
      }
    }

    // Always close modal and settings panel
    handleCloseResetModal();
    onHide();

    // Aggregate results and show appropriate toast
    const anythingSucceeded = settingsCleared || timeTrackingCleared || timeOffCleared;
    const somethingFailed = errors.length > 0;

    if (anythingSucceeded && !somethingFailed) {
      // All attempted operations succeeded
      const parts: string[] = [];
      if (settingsCleared) parts.push("Settings");
      if (timeTrackingCleared) parts.push("time tracking data");
      if (timeOffCleared) parts.push("time off data");
      toast.showSuccess(`${parts.join(" and ")} cleared`, "bi-trash");
    } else if (!anythingSucceeded && somethingFailed) {
      // All attempted operations failed
      toast.showWarning(`Failed to clear ${errors.join(", ")}. Please try again.`);
    } else if (anythingSucceeded && somethingFailed) {
      // Mixed results: some succeeded, some failed
      const successParts: string[] = [];
      if (settingsCleared) successParts.push("settings");
      if (timeTrackingCleared) successParts.push("time tracking data");
      if (timeOffCleared) successParts.push("time off data");
      toast.showWarning(
        `Cleared ${successParts.join(", ")} but failed to clear ${errors.join(", ")}`,
      );
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

  const handleChangeTeam = () => {
    onHide();
    onChangeTeam?.();
  };

  // Share handler
  const handleShareApp = () => {
    shareApp(
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
              </ListGroup>
            </div>
          </div>

          {/* Feature Toggles */}
          <div className="border-bottom">
            <div className="p-3">
              <h6 className="text-muted mb-3">
                <i className="bi bi-grid me-2"></i>
                Features
              </h6>
              <ListGroup variant="flush">
                <ListGroup.Item>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">Time Off</div>
                      <small className="text-muted">Manage time off events and vacation days</small>
                    </div>
                    <Form.Check
                      type="switch"
                      id="toggle-timeoff"
                      checked={settings.enableTimeOff}
                      onChange={(event) => updateTimeOffEnabled(event.target.checked)}
                      aria-label="Toggle time off"
                    />
                  </div>
                </ListGroup.Item>
                <ListGroup.Item>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-medium">Time Tracking</div>
                        <small className="text-muted">
                          Enable daily logging and weekly summaries
                        </small>
                      </div>
                      <Form.Check
                        type="switch"
                        id="toggle-timetracking"
                        checked={settings.enableTimeTracking}
                        onChange={(event) => updateTimeTrackingEnabled(event.target.checked)}
                        aria-label="Toggle time tracking"
                      />
                    </div>
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
                <ListGroup.Item action onClick={handleShortcutsClick}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-keyboard me-2"></i>
                        Keyboard Shortcuts
                      </div>
                      <small className="text-muted">Navigation and action shortcuts</small>
                    </div>
                    <i className="bi bi-chevron-right text-muted"></i>
                  </div>
                </ListGroup.Item>
                {isDevMode && (
                  <ListGroup.Item action onClick={handleDevOptionsClick}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-medium">
                          <i className="bi bi-code-slash me-2"></i>
                          Developer Options
                        </div>
                        <small className="text-muted">Backend API configuration</small>
                      </div>
                      <i className="bi bi-chevron-right text-muted"></i>
                    </div>
                  </ListGroup.Item>
                )}
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
                          Select Schedule
                        </div>
                        <small className="text-muted">Pick a different roster</small>
                      </div>
                      <i className="bi bi-chevron-right text-muted"></i>
                    </div>
                  </ListGroup.Item>
                )}
                {onChangeTeam && hasMultipleTeams(scheduleType) && (
                  <ListGroup.Item action onClick={handleChangeTeam}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-medium">
                          <i className="bi bi-person-gear me-2"></i>
                          Select Team
                        </div>
                        <small className="text-muted">Switch to a different team</small>
                      </div>
                      <i className="bi bi-chevron-right text-muted"></i>
                    </div>
                  </ListGroup.Item>
                )}
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
            <small
              className="text-muted d-block"
              onClick={handleVersionClick}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="Triple-click to toggle developer mode"
            >
              Worktime v{CONFIG.VERSION}
            </small>
            <small className="text-muted">Built with ❤️ by Jorim Tielemans</small>
          </div>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Changelog Modal */}
      <ChangelogModal show={showChangelog} onHide={handleChangelogClose} />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal show={showShortcuts} onHide={handleShortcutsClose} />

      {/* Developer Options Modal */}
      <DevOptionsPanel show={showDevOptions} onHide={handleDevOptionsClose} />

      {/* Reset Confirmation Modal */}
      <Modal show={showResetConfirm} onHide={handleCloseResetModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>Reset Settings</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-3">This will reset your app preferences and onboarding state.</p>
          <Form>
            <Form.Check
              id="reset-clear-time-tracking"
              type="checkbox"
              label="Also clear time tracking data (tasks, templates, labels)"
              checked={clearTimeTrackingData}
              onChange={(event) => setClearTimeTrackingData(event.target.checked)}
            />
            <Form.Check
              id="reset-clear-time-off"
              type="checkbox"
              className="mt-2"
              label="Also clear time off events (.hday data)"
              checked={clearTimeOffData}
              onChange={(event) => setClearTimeOffData(event.target.checked)}
            />
          </Form>
          {(clearTimeTrackingData || clearTimeOffData) && (
            <Alert variant="warning" className="mt-3 mb-0">
              <div className="fw-semibold mb-1">
                Warning: this data will be permanently removed.
              </div>
              {clearTimeTrackingData && (
                <div>Time tracking tasks, templates, and labels will be deleted.</div>
              )}
              {clearTimeOffData && (
                <div>All imported and created time off events (.hday content) will be deleted.</div>
              )}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleCloseResetModal}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirmReset}>
            Reset Now
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
