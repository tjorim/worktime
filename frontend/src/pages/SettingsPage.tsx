import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import Button from "react-bootstrap/Button";
import Badge from "react-bootstrap/Badge";
import ButtonGroup from "react-bootstrap/ButtonGroup";
import Form from "react-bootstrap/Form";
import ListGroup from "react-bootstrap/ListGroup";
import Alert from "react-bootstrap/Alert";
import OverlayTrigger from "react-bootstrap/OverlayTrigger";
import Tooltip from "react-bootstrap/Tooltip";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAppShellContext } from "@/contexts/AppShellContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStore } from "@/contexts/EventStoreContext";
import { validateAppBackupPayload, restoreAppBackup } from "@/utils/appBackup";
import { BackupDialog } from "@/components/BackupDialog";
import { useDeveloperOptions } from "@/contexts/DeveloperOptionsContext";
import { CONFIG } from "@/utils/config";
import { hasMultipleTeams, getTeamCountForOption } from "@/utils/scheduleUtils";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { shareApp } from "@/utils/share";
import { ChangelogModal } from "@/components/ChangelogModal";
import { KeyboardShortcutsModal } from "@/components/KeyboardShortcutsModal";
import { DevOptionsPanel } from "@/components/DevOptionsPanel";
import { ResetSettingsModal } from "@/components/ResetSettingsModal";
import { SettingsAboutSection } from "@/components/settings/SettingsAboutSection";
import { SettingsDataSection } from "@/components/settings/SettingsDataSection";
import { SettingsFeaturesSection } from "@/components/settings/SettingsFeaturesSection";
import { SettingsSyncSection } from "@/components/settings/SettingsSyncSection";
import { useApiClient } from "@/hooks/useApiClient";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";
import { labelsCollection, tasksCollection, templatesCollection } from "@/db/collections";
import { dayjs } from "@/utils/dateTimeUtils";
import * as m from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";


const SETTINGS_SECTIONS: Array<{
  key: SettingsSection;
  icon: string;
  label: () => string;
}> = [
  { key: "general", icon: "bi-sliders", label: m.preferences_title },
  { key: "features", icon: "bi-grid", label: m.features_title },
  { key: "account", icon: "bi-person-circle", label: m.account_section_title },
  { key: "sync", icon: "bi-cloud-check", label: m.sync_section_title },
  { key: "data", icon: "bi-database", label: m.quick_actions_title },
  { key: "about", icon: "bi-info-circle", label: m.information_title },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const { openAbout } = useAppShellContext();
  const activeSection = search.section ?? "general";

  const sectionMeta = useMemo(() => {
    const matchedSection = SETTINGS_SECTIONS.find((section) => section.key === activeSection);
    return matchedSection ?? SETTINGS_SECTIONS[0]!;
  }, [activeSection]);

  return (
    <main id="main-content" className="py-4">
      <div className="mx-auto" style={{ maxWidth: "1080px" }}>
        <div className="rounded-4 border bg-body-tertiary px-4 py-4 px-md-5 mb-4">
          <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
            <div>
              <div className="text-uppercase small text-muted fw-semibold mb-2">
                {m.settings_title()}
              </div>
              <h1 className="h3 mb-2">{sectionMeta.label()}</h1>
              <p className="text-muted mb-0">{m.settings_page_description()}</p>
            </div>
            <Button variant="outline-secondary" onClick={() => void navigate({ to: "/" })}>
              <i className="bi bi-arrow-left me-2"></i>
              {m.settings_page_back_btn()}
            </Button>
          </div>
        </div>

        <div className="row g-4 align-items-start">
          <div className="col-12 col-lg-4 col-xl-3">
            <div className="rounded-4 border bg-body shadow-sm overflow-hidden">
              <div className="px-3 py-3 border-bottom bg-body-tertiary">
                <div className="small text-uppercase text-muted fw-semibold">
                  {m.settings_page_nav_title()}
                </div>
              </div>
              <div className="p-2 d-grid gap-2">
                {SETTINGS_SECTIONS.map((section) => {
                  const isActive = section.key === activeSection;
                  return (
                    <Button
                      key={section.key}
                      variant={isActive ? "primary" : "outline-secondary"}
                      className="text-start d-flex align-items-center gap-2 justify-content-start"
                      onClick={() =>
                        void navigate({
                          to: "/settings",
                          search: { section: section.key },
                        })
                      }
                    >
                      <i className={`bi ${section.icon}`}></i>
                      <span>{section.label()}</span>
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-8 col-xl-9">
            <SettingsContent
              activeSection={activeSection}
              onHide={() => void navigate({ to: "/" })}
              onShowAbout={openAbout}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

export type SettingsSection =
  | "general"
  | "features"
  | "account"
  | "sync"
  | "data"
  | "about";

interface AccountProfile {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  capabilities: {
    backup_enabled: boolean;
  };
}

function clearCollectionById(collection: {
  toArray: Array<{ id: string }>;
  has: (id: string) => boolean;
  delete: (id: string) => void;
}): void {
  for (const item of [...collection.toArray]) {
    if (collection.has(item.id)) {
      collection.delete(item.id);
    }
  }
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
export function SettingsContent({
  onHide,
  onShowAbout,
  activeSection = null,
}: {
  onHide: () => void;
  onShowAbout?: () => void;
  activeSection?: SettingsSection | null;
}) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [clearTimeTrackingData, setClearTimeTrackingData] = useState(false);
  const [clearTimeOffData, setClearTimeOffData] = useState(false);
  const [accountProfile, setAccountProfile] = useState<AccountProfile | null>(null);
  const [profileDraft, setProfileDraft] = useState("");
  const [isProfileLoading, setIsProfileLoading] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const versionClickCountRef = useRef(0);
  const versionClickTimeoutRef = useRef<number | null>(null);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { clearAll: clearTimeOffEvents } = useEventStore();
  const { isDevMode, toggleDevMode } = useDeveloperOptions();
  const fetchFn = useApiClient();
  const { isAuthenticated, isValidating, userId, displayName, triggerLogin, triggerSignup, logout } =
    useAuth();
  const { isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount, retryAfter, triggerPull } =
    useOngoingSyncContext();
  const {
    settings,
    scheduleType,
    myTeam,
    setMyTeam,
    setScheduleType,
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

  useEffect(() => {
    if (!isAuthenticated) {
      setAccountProfile(null);
      setProfileDraft("");
      setProfileError(null);
      setIsProfileLoading(false);
      return;
    }

    let isCancelled = false;
    setIsProfileLoading(true);
    setProfileError(null);

    fetchFn("/api/me")
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unexpected status: ${response.status}`);
        }
        const profile = (await response.json()) as AccountProfile;
        if (isCancelled) return;
        setAccountProfile(profile);
        setProfileDraft(profile.display_name);
      })
      .catch((error) => {
        if (isCancelled) return;
        console.error("Failed to load account profile:", error);
        setProfileError(m.account_profile_load_failed());
      })
      .finally(() => {
        if (!isCancelled) {
          setIsProfileLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [isAuthenticated, fetchFn]);

  const handleSaveProfile = async () => {
    if (!accountProfile) return;
    const nextDisplayName = profileDraft.trim();
    if (!nextDisplayName) {
      setProfileError(m.account_profile_display_name_required());
      return;
    }

    setIsProfileSaving(true);
    setProfileError(null);

    try {
      const response = await fetchFn(`/api/users/${accountProfile.id}`, {
        method: "PUT",
        body: JSON.stringify({ display_name: nextDisplayName }),
      });
      if (!response.ok) {
        throw new Error(`Unexpected status: ${response.status}`);
      }
      const updatedProfile = (await response.json()) as {
        id: number;
        username: string;
        display_name: string;
      };
      setAccountProfile((current) =>
        current
          ? {
              ...current,
              username: updatedProfile.username,
              display_name: updatedProfile.display_name,
            }
          : current,
      );
      setProfileDraft(updatedProfile.display_name);
      toast.showSuccess(m.account_profile_saved(), "bi-person-check");
    } catch (error) {
      console.error("Failed to save account profile:", error);
      setProfileError(m.account_profile_save_failed());
    } finally {
      setIsProfileSaving(false);
    }
  };

  const syncStatus = useMemo(() => {
    if (!isAuthenticated) {
      return {
        icon: "bi-cloud-slash",
        label: m.account_not_signed_in(),
        variant: "muted",
      };
    }
    if (hasSyncError) {
      return { icon: "bi-cloud-slash", label: m.sync_indicator_error(), variant: "danger" };
    }
    if (conflictCount > 0) {
      return {
        icon: "bi-exclamation-triangle",
        label: m.sync_indicator_conflicts({ count: String(conflictCount) }),
        variant: "warning",
      };
    }
    if (isSyncing) {
      return { icon: "bi-arrow-repeat", label: m.sync_indicator_syncing(), variant: "info" };
    }
    if (outboxCount > 0) {
      return {
        icon: "bi-cloud-upload",
        label: m.sync_indicator_pending({ count: String(outboxCount) }),
        variant: "warning",
      };
    }
    if (lastSyncedAt) {
      return { icon: "bi-cloud-check", label: m.sync_indicator_synced(), variant: "success" };
    }
    return {
      icon: "bi-cloud",
      label: m.sync_never_synced(),
      variant: "muted",
    };
  }, [isAuthenticated, hasSyncError, conflictCount, isSyncing, outboxCount, lastSyncedAt]);

  const retryInSeconds =
    retryAfter !== null ? Math.max(0, Math.ceil((retryAfter - Date.now()) / 1_000)) : null;
  const hasProfileChanges =
    accountProfile !== null &&
    profileDraft.trim() !== "" &&
    profileDraft.trim() !== accountProfile.display_name;
  const lastSyncedLabel = lastSyncedAt
    ? dayjs(lastSyncedAt).format("DD MMM YYYY HH:mm")
    : m.sync_never_synced();
  const resolvedDisplayName = accountProfile?.display_name ?? displayName;

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
        clearCollectionById(tasksCollection);
        clearCollectionById(templatesCollection);
        clearCollectionById(labelsCollection);
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

  const handleScheduleChange = (schedule: ScheduleOption) => {
    const scheduleChanged = schedule !== scheduleType;
    if (scheduleChanged && myTeam !== null) {
      setMyTeam(null);
      toast?.showInfo(m.schedule_team_reset_changed());
    } else if (!hasMultipleTeams(schedule) && myTeam !== null) {
      setMyTeam(null);
      toast?.showInfo(m.schedule_team_reset_no_teams());
    }
    setScheduleType(schedule);
  };

  // Share handler
  const handleShareApp = () => {
    shareApp(
      () => toast?.showSuccess(m.share_success()),
      () => toast?.showError(m.share_failed()),
    );
  };

  const visibleSection = activeSection ?? "general";
  const showSection = (section: SettingsSection) => visibleSection === section;

  const settingsBody = (
    <>
      {showSection("account") && (
        <div className="border-bottom">
          <div className="p-3">
          <h6 className="text-muted mb-3">
            <i className="bi bi-person-circle me-2"></i>
            {m.account_section_title()}
          </h6>
          <ListGroup variant="flush">
            {isValidating ? (
              <ListGroup.Item>
                <div className="d-flex align-items-center gap-2 text-muted small">
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  <span>{m.loading()}</span>
                </div>
              </ListGroup.Item>
            ) : isAuthenticated ? (
              <ListGroup.Item>
                <div className="d-flex flex-column gap-3">
                  <div className="d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <div className="fw-medium">
                        <i className="bi bi-person-check me-2 text-success"></i>
                        {resolvedDisplayName
                          ? m.auth_logged_in_as({ displayName: resolvedDisplayName })
                          : m.account_signed_in()}
                      </div>
                      {accountProfile?.username ? (
                        <small className="text-muted">@{accountProfile.username}</small>
                      ) : null}
                    </div>
                    <Button variant="outline-secondary" size="sm" onClick={logout}>
                      <i className="bi bi-box-arrow-right me-1"></i>
                      {m.auth_logout()}
                    </Button>
                  </div>

                  {profileError ? (
                    <Alert variant="warning" className="mb-0 py-2">
                      {profileError}
                    </Alert>
                  ) : null}

                  {isProfileLoading && accountProfile === null ? (
                    <div className="d-flex align-items-center gap-2 text-muted small">
                      <span
                        className="spinner-border spinner-border-sm"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      <span>{m.loading()}</span>
                    </div>
                  ) : (
                    <>
                      <Form.Group controlId="account-display-name">
                        <Form.Label className="fw-medium mb-1">
                          {m.account_profile_display_name_label()}
                        </Form.Label>
                        <Form.Control
                          size="sm"
                          type="text"
                          value={profileDraft}
                          onChange={(event) => setProfileDraft(event.target.value)}
                          placeholder={m.account_profile_display_name_placeholder()}
                          disabled={accountProfile === null || isProfileSaving}
                        />
                        <Form.Text className="text-muted">
                          {m.account_profile_display_name_description()}
                        </Form.Text>
                      </Form.Group>

                      <div className="small text-muted d-flex flex-column gap-1">
                        <div>
                          <span className="fw-medium">{m.account_profile_username_label()}:</span>{" "}
                          {accountProfile?.username ?? "—"}
                        </div>
                        <div>
                          <span className="fw-medium">{m.account_profile_user_id_label()}:</span>{" "}
                          {accountProfile?.id ?? userId ?? "—"}
                        </div>
                        <div>
                          <span className="fw-medium">{m.account_profile_role_label()}:</span>{" "}
                          {accountProfile?.is_admin
                            ? m.account_profile_role_admin()
                            : m.account_profile_role_member()}
                        </div>
                      </div>

                      <div className="d-flex gap-2 flex-wrap">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={handleSaveProfile}
                          disabled={!hasProfileChanges || isProfileSaving || accountProfile === null}
                        >
                          <i className="bi bi-floppy me-1"></i>
                          {isProfileSaving
                            ? m.account_profile_saving_btn()
                            : m.account_profile_save_btn()}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </ListGroup.Item>
            ) : (
              <ListGroup.Item>
                <div className="mb-2">
                  <div className="fw-medium mb-1">
                    <i className="bi bi-person-x me-2 text-muted"></i>
                    {m.account_not_signed_in()}
                  </div>
                  <small className="text-muted d-block mb-2">{m.account_sync_benefits()}</small>
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    <small className="text-muted">
                      <i className="bi bi-cloud-check text-success me-1"></i>
                      {m.account_sync_benefit_backup()}
                    </small>
                    <small className="text-muted">
                      <i className="bi bi-phone text-success me-1"></i>
                      {m.account_sync_benefit_crossdevice()}
                    </small>
                  </div>
                </div>
                <div className="d-flex gap-2 flex-wrap">
                  <Button variant="primary" size="sm" onClick={triggerSignup}>
                    <i className="bi bi-person-plus me-1"></i>
                    {m.account_connect_btn()}
                  </Button>
                  <Button variant="outline-primary" size="sm" onClick={triggerLogin}>
                    <i className="bi bi-box-arrow-in-right me-1"></i>
                    {m.account_sign_in_btn()}
                  </Button>
                </div>
              </ListGroup.Item>
            )}
          </ListGroup>
        </div>
      </div>
      )}

      {showSection("sync") && (
        <SettingsSyncSection
          isAuthenticated={isAuthenticated}
          isSyncing={isSyncing}
          syncStatus={syncStatus}
          lastSyncedLabel={lastSyncedLabel}
          outboxCount={outboxCount}
          conflictCount={conflictCount}
          backupStatusLabel={
            accountProfile?.capabilities?.backup_enabled === true
              ? m.sync_backup_status_enabled()
              : accountProfile?.capabilities?.backup_enabled === false
                ? m.sync_backup_status_disabled()
                : m.sync_backup_status_unknown()
          }
          hasSyncError={hasSyncError}
          retryInSeconds={retryInSeconds}
          onTriggerPull={triggerPull}
        />
      )}

      {showSection("general") && (
        <div className="border-bottom">
        <div className="p-3">
          <h6 className="text-muted mb-3">
            <i className="bi bi-calendar-week me-2"></i>
            {m.select_schedule_label()}
          </h6>
          <ListGroup variant="flush" className="mb-3">
            {SCHEDULE_OPTIONS.map((schedule) => {
              const isSelected = scheduleType === schedule.value;
              const item = (
                <ListGroup.Item
                  key={schedule.value}
                  action
                  active={isSelected}
                  disabled={!schedule.isAvailable}
                  onClick={() => schedule.isAvailable && handleScheduleChange(schedule.value)}
                  className="d-flex justify-content-between align-items-center"
                >
                  <div>
                    <div className="fw-semibold d-flex align-items-center gap-2">
                      {schedule.title}
                      {!schedule.isAvailable && (
                        <Badge bg="secondary" className="fw-normal" style={{ fontSize: "0.65em" }}>
                          {m.wizard_coming_soon_badge()}
                        </Badge>
                      )}
                    </div>
                    <small className={isSelected ? "text-white-50" : "text-muted"}>
                      {schedule.description}
                    </small>
                  </div>
                  {isSelected && <i className="bi bi-check-lg ms-2 flex-shrink-0" aria-hidden="true" />}
                </ListGroup.Item>
              );
              return schedule.isAvailable ? item : (
                <OverlayTrigger
                  key={schedule.value}
                  placement="top"
                  overlay={<Tooltip>{m.wizard_schedule_coming_soon_tooltip()}</Tooltip>}
                >
                  <span>{item}</span>
                </OverlayTrigger>
              );
            })}
          </ListGroup>

          {scheduleType && hasMultipleTeams(scheduleType) && (
            <>
              <h6 className="text-muted mb-3">
                <i className="bi bi-people me-2"></i>
                {m.select_team_label()}
              </h6>
              <div className="d-flex flex-wrap gap-2 mb-3">
                {Array.from({ length: getTeamCountForOption(scheduleType) }, (_, i) => i + 1).map((team) => (
                  <Button
                    key={team}
                    size="sm"
                    variant={myTeam === team ? "primary" : "outline-secondary"}
                    aria-pressed={myTeam === team}
                    aria-label={m.wizard_team_btn_aria({ team: String(team) })}
                    onClick={() => setMyTeam(team)}
                  >
                    {m.wizard_team_btn_label({ team: String(team) })}
                  </Button>
                ))}
              </div>
              {myTeam === null && (
                <small className="text-muted">{m.settings_no_team_selected()}</small>
              )}
            </>
          )}
        </div>
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
            <ListGroup.Item className="text-muted">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <div className="fw-medium d-flex align-items-center gap-2">
                    {m.notifications_label()}
                    <Badge bg="secondary" pill className="fw-normal" style={{ fontSize: "0.65em" }}>
                      {m.wizard_coming_soon_badge()}
                    </Badge>
                  </div>
                  <small>{m.notifications_description()}</small>
                </div>
                <Form.Check
                  type="switch"
                  id="toggle-notifications"
                  checked={false}
                  disabled
                  aria-label={m.notifications_label()}
                />
              </div>
            </ListGroup.Item>
          </ListGroup>
        </div>
      </div>
      )}
    </>
  );

  const settingsSections = (
    <>
      {settingsBody}

      {showSection("features") && (
        <SettingsFeaturesSection
          enableTimeOff={settings.enableTimeOff}
          enableTimeTracking={settings.enableTimeTracking}
          enableGantt={settings.enableGantt}
          enableCrossBorderTracking={settings.enableCrossBorderTracking}
          homeCountry={settings.homeCountry ?? null}
          officeCountry={settings.officeCountry ?? null}
          onToggleTimeOff={updateTimeOffEnabled}
          onToggleTimeTracking={updateTimeTrackingEnabled}
          onToggleGantt={updateGanttEnabled}
          onToggleCrossBorderTracking={updateCrossBorderTrackingEnabled}
          onUpdateHomeCountry={updateHomeCountry}
          onUpdateOfficeCountry={updateOfficeCountry}
        />
      )}

      {showSection("about") && (
        <SettingsAboutSection
          isDevMode={isDevMode}
          onShowChangelog={handleChangelogClick}
          onShowAboutHelp={handleAboutHelpClick}
          onShowShortcuts={handleShortcutsClick}
          onShowDevOptions={handleDevOptionsClick}
        />
      )}

      {showSection("data") && (
        <SettingsDataSection
          onShareApp={handleShareApp}
          onShowBackupDialog={() => setShowBackupDialog(true)}
          onRestoreBackup={() => restoreFileInputRef.current?.click()}
          onResetSettings={handleClearData}
        />
      )}
    </>
  );

  return (
    <>
      <section className="rounded-4 border bg-body shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-bottom bg-body-tertiary">
          <h2 className="h5 mb-1">{m.settings_title()}</h2>
          <p className="text-muted mb-0">{m.settings_page_surface_description()}</p>
        </div>
        <div>{settingsSections}</div>
        <div className="px-4 py-3 text-center border-top">
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
      </section>

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
      <ResetSettingsModal
        show={showResetConfirm}
        clearTimeTrackingData={clearTimeTrackingData}
        clearTimeOffData={clearTimeOffData}
        onClose={handleCloseResetModal}
        onConfirm={handleConfirmReset}
        onChangeClearTimeTrackingData={setClearTimeTrackingData}
        onChangeClearTimeOffData={setClearTimeOffData}
      />
    </>
  );
}
