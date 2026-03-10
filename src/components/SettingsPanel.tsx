import { useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Button from "react-bootstrap/Button";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Modal from "react-bootstrap/Modal";
import Offcanvas from "react-bootstrap/Offcanvas";
import Alert from "react-bootstrap/Alert";
import { useSettings } from "../contexts/SettingsContext";
import { useToast } from "../contexts/ToastContext";
import { type CountryCode } from "../types/countries";
import { CountrySelect } from "./shared/CountrySelect";
import { useEventStore } from "../contexts/EventStoreContext";
import { TIME_OFF_STORAGE_KEY, TIME_TRACKING_STORAGE_KEYS } from "../constants/storageKeys";
import { validateAppBackupPayload, restoreAppBackup } from "../utils/appBackup";
import { BackupDialog } from "./BackupDialog";
import { useDeveloperOptions } from "../contexts/DeveloperOptionsContext";
import { CONFIG } from "../utils/config";
import { hasMultipleTeams } from "../utils/scheduleUtils";
import { shareApp } from "../utils/share";
import { ChangelogModal } from "./ChangelogModal";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";
import { DevOptionsPanel } from "./DevOptionsPanel";
import * as m from "../paraglide/messages.js";
import { getLocale, setLocale } from "../paraglide/runtime.js";

interface CountrySelectItemProps {
  label: string;
  description: string;
  value: CountryCode | null;
  onUpdate: (country: CountryCode | null) => void;
  ariaLabel?: string;
}

function CountrySelectItem({
  label,
  description,
  value,
  onUpdate,
  ariaLabel,
}: CountrySelectItemProps) {
  return (
    <ListGroup.Item>
      <div className="d-flex justify-content-between align-items-center gap-3">
        <div>
          <div className="fw-medium">{label}</div>
          <small className="text-muted">{description}</small>
        </div>
        <div style={{ minWidth: "12rem" }}>
          <CountrySelect value={value} onChange={onUpdate} ariaLabel={ariaLabel ?? label} />
        </div>
      </div>
    </ListGroup.Item>
  );
}

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
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [clearTimeTrackingData, setClearTimeTrackingData] = useState(false);
  const [clearTimeOffData, setClearTimeOffData] = useState(false);
  const versionClickCountRef = useRef(0);
  const versionClickTimeoutRef = useRef<number | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
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
    updateGanttEnabled,
    updateCrossBorderTrackingEnabled,
    updateHomeCountry,
    updateOfficeCountry,
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
    // Clear existing timeout if any
    if (versionClickTimeoutRef.current !== null) {
      clearTimeout(versionClickTimeoutRef.current);
    }

    // Increment click count
    versionClickCountRef.current += 1;

    // If third click, toggle dev mode
    if (versionClickCountRef.current === 3) {
      toggleDevMode();
      const message = isDevMode ? m.developer_mode_disabled() : m.developer_mode_enabled();
      toast.showInfo(message);
      versionClickCountRef.current = 0;
      versionClickTimeoutRef.current = null;
    } else {
      // Reset counter after 1 second
      versionClickTimeoutRef.current = window.setTimeout(() => {
        versionClickCountRef.current = 0;
        versionClickTimeoutRef.current = null;
      }, 1000);
    }
  };

  const handleVersionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleVersionClick();
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
    const listFormat = new Intl.ListFormat(getLocale(), { style: "long", type: "conjunction" });
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
      errors.push(m.reset_item_settings());
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
        errors.push(m.reset_item_time_tracking_data());
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
        errors.push(m.reset_item_time_off_data());
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
      if (settingsCleared) parts.push(m.reset_item_settings());
      if (timeTrackingCleared) parts.push(m.reset_item_time_tracking_data());
      if (timeOffCleared) parts.push(m.reset_item_time_off_data());
      toast.showSuccess(m.data_cleared({ items: listFormat.format(parts) }), "bi-trash");
    } else if (!anythingSucceeded && somethingFailed) {
      // All attempted operations failed
      toast.showWarning(m.failed_to_clear({ items: listFormat.format(errors) }));
    } else if (anythingSucceeded && somethingFailed) {
      // Mixed results: some succeeded, some failed
      const successParts: string[] = [];
      if (settingsCleared) successParts.push(m.reset_item_settings());
      if (timeTrackingCleared) successParts.push(m.reset_item_time_tracking_data());
      if (timeOffCleared) successParts.push(m.reset_item_time_off_data());
      toast.showWarning(
        m.cleared_but_failed_to_clear({
          clearedItems: listFormat.format(successParts),
          failedItems: listFormat.format(errors),
        }),
      );
    }
  };

  const handleRestoreFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!validateAppBackupPayload(parsed)) {
        toast.showError(m.restore_failed());
        return;
      }
      restoreAppBackup(parsed);
    } catch {
      toast.showError(m.restore_failed());
    } finally {
      event.target.value = "";
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
      () => toast?.showSuccess(m.share_success()),
      () => toast?.showError(m.share_failed()),
    );
  };

  return (
    <>
      <Offcanvas show={show} onHide={onHide} placement="end">
        <Offcanvas.Header closeButton>
          <Offcanvas.Title>
            <i className="bi bi-gear me-2"></i>
            {m.settings_title()}
          </Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0 d-flex flex-column">
          {/* App Preferences Section */}
          <div className="border-bottom">
            <div className="p-3">
              <h6 className="text-muted mb-3">
                <i className="bi bi-sliders me-2"></i>
                {m.preferences_title()}
              </h6>
              <ListGroup variant="flush">
                <ListGroup.Item className="">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">{m.time_format_label()}</div>
                      <small className="text-muted">{m.time_format_description()}</small>
                    </div>
                    <ButtonGroup size="sm" aria-label={m.time_format_label()}>
                      <Button
                        variant={settings.timeFormat === "24h" ? "primary" : "outline-secondary"}
                        aria-pressed={settings.timeFormat === "24h"}
                        onClick={() => updateTimeFormat("24h")}
                      >
                        24h
                      </Button>
                      <Button
                        variant={settings.timeFormat === "12h" ? "primary" : "outline-secondary"}
                        aria-pressed={settings.timeFormat === "12h"}
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
                      <div className="fw-medium">{m.theme_label()}</div>
                      <small className="text-muted">{m.theme_description()}</small>
                    </div>
                    <ButtonGroup size="sm" aria-label={m.theme_label()}>
                      <Button
                        variant={settings.theme === "auto" ? "primary" : "outline-secondary"}
                        aria-pressed={settings.theme === "auto"}
                        onClick={() => updateTheme("auto")}
                      >
                        <i className="bi bi-circle-half me-1"></i>
                        {m.theme_auto()}
                      </Button>
                      <Button
                        variant={settings.theme === "light" ? "primary" : "outline-secondary"}
                        aria-pressed={settings.theme === "light"}
                        onClick={() => updateTheme("light")}
                      >
                        <i className="bi bi-sun me-1"></i>
                        {m.theme_light()}
                      </Button>
                      <Button
                        variant={settings.theme === "dark" ? "primary" : "outline-secondary"}
                        aria-pressed={settings.theme === "dark"}
                        onClick={() => updateTheme("dark")}
                      >
                        <i className="bi bi-moon me-1"></i>
                        {m.theme_dark()}
                      </Button>
                    </ButtonGroup>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item className="">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">{m.language_label()}</div>
                      <small className="text-muted">{m.language_description()}</small>
                    </div>
                    <ButtonGroup size="sm" aria-label={m.language_label()}>
                      <Button
                        variant={getLocale() === "en" ? "primary" : "outline-secondary"}
                        aria-pressed={getLocale() === "en"}
                        onClick={() => setLocale("en")}
                      >
                        EN
                      </Button>
                      <Button
                        variant={getLocale() === "nl" ? "primary" : "outline-secondary"}
                        aria-pressed={getLocale() === "nl"}
                        onClick={() => setLocale("nl")}
                      >
                        NL
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
                        <div className="fw-medium">{m.time_tracking_label()}</div>
                        <small className="text-muted">{m.time_tracking_description()}</small>
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
                <ListGroup.Item>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">{m.personal_gantt_label()}</div>
                      <small className="text-muted">{m.personal_gantt_description()}</small>
                    </div>
                    <Form.Check
                      type="switch"
                      id="toggle-gantt"
                      checked={settings.enableGantt}
                      onChange={(event) => updateGanttEnabled(event.target.checked)}
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
                      checked={settings.enableCrossBorderTracking}
                      onChange={(event) => updateCrossBorderTrackingEnabled(event.target.checked)}
                      aria-label="Toggle cross-border tracking"
                    />
                  </div>
                </ListGroup.Item>
              </ListGroup>
            </div>
          </div>

          {/* Cross-Border Setup Section — only shown when the feature is enabled */}
          {settings.enableCrossBorderTracking && (
            <div className="border-bottom">
              <div className="p-3">
                <h6 className="text-muted mb-3">
                  <i className="bi bi-globe me-2"></i>
                  {m.cross_border_setup_label()}
                </h6>
                <small className="text-muted d-block mb-3">
                  {m.cross_border_setup_description()}
                </small>
                <ListGroup variant="flush">
                  <CountrySelectItem
                    label={m.home_country_label()}
                    description={m.home_country_description()}
                    value={settings.homeCountry ?? null}
                    onUpdate={updateHomeCountry}
                    ariaLabel={m.home_country_label()}
                  />
                  <CountrySelectItem
                    label={m.office_country_label()}
                    description={m.office_country_description()}
                    value={settings.officeCountry ?? null}
                    onUpdate={updateOfficeCountry}
                    ariaLabel={m.office_country_label()}
                  />
                </ListGroup>
              </div>
            </div>
          )}

          {/* Information Section */}
          <div className="border-bottom">
            <div className="p-3">
              <h6 className="text-muted mb-3">
                <i className="bi bi-info-circle me-2"></i>
                {m.information_title()}
              </h6>
              <ListGroup variant="flush">
                <ListGroup.Item action onClick={handleChangelogClick}>
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
                <ListGroup.Item action onClick={handleAboutHelpClick}>
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
                <ListGroup.Item action onClick={handleShortcutsClick}>
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
                  <ListGroup.Item action onClick={handleDevOptionsClick}>
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

          {/* Quick Actions Section */}
          <div>
            <div className="p-3">
              <h6 className="text-muted mb-3">
                <i className="bi bi-lightning me-2"></i>
                {m.quick_actions_title()}
              </h6>
              <ListGroup variant="flush">
                {onChangeSchedule && (
                  <ListGroup.Item action onClick={handleChangeSchedule}>
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <div className="fw-medium">
                          <i className="bi bi-calendar-week me-2"></i>
                          {m.select_schedule_label()}
                        </div>
                        <small className="text-muted">{m.select_schedule_description()}</small>
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
                          {m.select_team_label()}
                        </div>
                        <small className="text-muted">{m.select_team_description()}</small>
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
                        {m.share_app_label()}
                      </div>
                      <small className="text-muted">{m.share_app_description()}</small>
                    </div>
                    <i className="bi bi-share text-muted"></i>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item action onClick={() => setShowBackupDialog(true)}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-download me-2"></i>
                        {m.backup_app_data_label()}
                      </div>
                      <small className="text-muted">{m.backup_app_data_description()}</small>
                    </div>
                    <i className="bi bi-chevron-right text-muted"></i>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item action onClick={() => restoreFileInputRef.current?.click()}>
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-upload me-2"></i>
                        {m.restore_backup_label()}
                      </div>
                      <small className="text-muted">{m.restore_backup_description()}</small>
                    </div>
                    <i className="bi bi-chevron-right text-muted"></i>
                  </div>
                </ListGroup.Item>
                <ListGroup.Item action onClick={handleClearData} className="text-danger">
                  <div className="d-flex justify-content-between align-items-center">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-trash me-2"></i>
                        {m.reset_settings_label()}
                      </div>
                      <small className="text-muted">{m.reset_settings_description()}</small>
                    </div>
                    <i className="bi bi-arrow-clockwise text-danger"></i>
                  </div>
                </ListGroup.Item>
              </ListGroup>
            </div>
          </div>

          {/* App Version Footer */}
          <div className="mt-auto p-3 text-center border-top">
            <button
              type="button"
              className="btn btn-link text-muted d-block p-0 mx-auto text-decoration-none"
              onClick={handleVersionClick}
              onKeyDown={handleVersionKeyDown}
              style={{ cursor: "pointer", userSelect: "none" }}
              aria-label={m.footer_version_aria({ version: CONFIG.VERSION })}
            >
              {m.footer_version({ version: CONFIG.VERSION })}
            </button>
            <small className="text-muted">{m.footer_built_by()}</small>
          </div>
        </Offcanvas.Body>
      </Offcanvas>

      {/* Changelog Modal */}
      <ChangelogModal show={showChangelog} onHide={handleChangelogClose} />

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        show={showShortcuts}
        onHide={handleShortcutsClose}
        enableTimeOff={settings.enableTimeOff}
        enableTimeTracking={settings.enableTimeTracking}
        enableGantt={settings.enableGantt}
      />

      {/* Developer Options Modal */}
      <DevOptionsPanel show={showDevOptions} onHide={handleDevOptionsClose} />

      {/* Backup Dialog */}
      <BackupDialog show={showBackupDialog} onHide={() => setShowBackupDialog(false)} />

      {/* Hidden file input for restore */}
      <input
        ref={restoreFileInputRef}
        type="file"
        accept="application/json"
        className="d-none"
        aria-label="Restore backup file"
        onChange={handleRestoreFileChange}
      />

      {/* Reset Confirmation Modal */}
      <Modal show={showResetConfirm} onHide={handleCloseResetModal} centered>
        <Modal.Header closeButton>
          <Modal.Title>{m.reset_settings_modal_title()}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-3">{m.reset_settings_modal_body()}</p>
          <Form>
            <Form.Check
              id="reset-clear-time-tracking"
              type="checkbox"
              label={m.reset_also_clear_time_tracking()}
              checked={clearTimeTrackingData}
              onChange={(event) => setClearTimeTrackingData(event.target.checked)}
            />
            <Form.Check
              id="reset-clear-time-off"
              type="checkbox"
              className="mt-2"
              label={m.reset_also_clear_time_off()}
              checked={clearTimeOffData}
              onChange={(event) => setClearTimeOffData(event.target.checked)}
            />
          </Form>
          {(clearTimeTrackingData || clearTimeOffData) && (
            <Alert variant="warning" className="mt-3 mb-0">
              <div className="fw-semibold mb-1">{m.reset_warning()}</div>
              {clearTimeTrackingData && <div>{m.reset_warning_time_tracking()}</div>}
              {clearTimeOffData && <div>{m.reset_warning_time_off()}</div>}
            </Alert>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={handleCloseResetModal}>
            {m.cancel()}
          </Button>
          <Button variant="danger" onClick={handleConfirmReset}>
            {m.reset_now()}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
