import { useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useVersionClickEasterEgg } from "@/pages/settings/hooks/useVersionClickEasterEgg";
import Button from "react-bootstrap/Button";
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
import { hasMultipleTeams } from "@/utils/scheduleUtils";
import { type ScheduleOption } from "@/data/rosters";
import { shareApp } from "@/utils/share";
import { ChangelogModal } from "@/components/ChangelogModal";
import { DevOptionsPanel } from "@/components/DevOptionsPanel";
import { ResetSettingsModal } from "@/components/settings/data/ResetSettingsModal";
import { SettingsAccountSection } from "@/components/settings/account/SettingsAccountSection";
import { SettingsAboutSection } from "@/components/settings/SettingsAboutSection";
import { SettingsDataSection } from "@/components/settings/data/SettingsDataSection";
import { SettingsFeaturesSection } from "@/components/settings/SettingsFeaturesSection";
import { SettingsGeneralSection } from "@/components/settings/SettingsGeneralSection";
import { SettingsSyncSection } from "@/components/settings/account/SettingsSyncSection";
import { useApiClient } from "@/hooks/useApiClient";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";
import { useSettingsAccount } from "@/pages/settings/hooks/useSettingsAccount";
import { useSettingsSyncStatus } from "@/pages/settings/hooks/useSettingsSyncStatus";
import { useSettingsResetFlow } from "@/pages/settings/hooks/useSettingsResetFlow";
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
  const { openAbout, openShortcuts } = useAppShellContext();
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
              onShowShortcuts={openShortcuts}
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

/**
 * Renders the settings content for the selected section in the settings page layout.
 *
 * @param onHide - Callback invoked when a settings action should close the page
 * @param onShowAbout - Optional callback invoked to open the global About experience
 * @param onShowShortcuts - Optional callback invoked to open the global keyboard shortcuts overlay
 * @param activeSection - Active settings section key; defaults to "general" when unset
 * @returns Rendered settings page content
 */
export function SettingsContent({
  onHide,
  onShowAbout,
  onShowShortcuts,
  activeSection = "general",
}: {
  onHide: () => void;
  onShowAbout?: () => void;
  onShowShortcuts?: () => void;
  activeSection?: SettingsSection;
}) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
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
    updateUnifiedCalendarEnabled,
    updateHomeCountry,
    updateOfficeCountry,
    resetSettings,
  } = useSettings();
  const {
    accountProfile,
    profileDraft,
    setProfileDraft,
    isProfileLoading,
    isProfileSaving,
    profileError,
    hasProfileChanges,
    resolvedDisplayName,
    handleSaveProfile,
    adminUsers,
    isAdminUsersLoading,
    adminUsersError,
    adminUsersDeleteError,
    deletingAdminUserId,
    handleDeleteAdminUser,
    isDeletingAccount,
    deleteAccountError,
    handleDeleteAccount,
  } = useSettingsAccount({
    isAuthenticated,
    displayName,
    fetchFn,
    showSuccessToast: toast.showSuccess,
    onAccountDeleted: logout,
  });
  const { syncStatus, retryInSeconds, lastSyncedLabel, backupStatusLabel } = useSettingsSyncStatus({
    isAuthenticated,
    hasSyncError,
    conflictCount,
    isSyncing,
    outboxCount,
    lastSyncedAt,
    retryAfter,
    backupEnabled: accountProfile?.capabilities?.backup_enabled,
  });
  const {
    showResetConfirm,
    clearTimeTrackingData,
    setClearTimeTrackingData,
    clearTimeOffData,
    setClearTimeOffData,
    handleClearData,
    handleCloseResetModal,
    handleConfirmReset,
  } = useSettingsResetFlow({
    resetSettings,
    clearTimeOffEvents,
    onHide,
    showSuccessToast: toast.showSuccess,
    showWarningToast: toast.showWarning,
  });
  const { handleVersionClick, handleVersionKeyDown } = useVersionClickEasterEgg({
    isDevMode,
    toggleDevMode,
    showInfoToast: toast.showInfo,
  });

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

  const handleShareApp = () => {
    shareApp(
      () => toast?.showSuccess(m.share_success()),
      () => toast?.showError(m.share_failed()),
    );
  };

  const sectionRenderers: Record<SettingsSection, () => ReactNode> = {
    account: () => (
      <SettingsAccountSection
        isValidating={isValidating}
        isAuthenticated={isAuthenticated}
        resolvedDisplayName={resolvedDisplayName}
        username={accountProfile?.username ?? null}
        accountId={accountProfile?.id ?? null}
        userId={userId}
        isAdmin={accountProfile?.is_admin ?? false}
        profileError={profileError}
        isProfileLoading={isProfileLoading}
        profileDraft={profileDraft}
        isProfileSaving={isProfileSaving}
        hasProfileChanges={hasProfileChanges}
        onProfileDraftChange={setProfileDraft}
        onSaveProfile={() => void handleSaveProfile()}
        adminUsers={adminUsers}
        isAdminUsersLoading={isAdminUsersLoading}
        adminUsersError={adminUsersError}
        adminUsersDeleteError={adminUsersDeleteError}
        deletingAdminUserId={deletingAdminUserId}
        onDeleteAdminUser={(userId) => void handleDeleteAdminUser(userId)}
        isDeletingAccount={isDeletingAccount}
        deleteAccountError={deleteAccountError}
        onDeleteAccount={() => void handleDeleteAccount()}
        onLogout={logout}
        onSignup={triggerSignup}
        onLogin={triggerLogin}
      />
    ),
    sync: () => (
      <SettingsSyncSection
        isAuthenticated={isAuthenticated}
        isSyncing={isSyncing}
        syncStatus={syncStatus}
        lastSyncedLabel={lastSyncedLabel}
        outboxCount={outboxCount}
        conflictCount={conflictCount}
        backupStatusLabel={backupStatusLabel}
        hasSyncError={hasSyncError}
        retryInSeconds={retryInSeconds}
        onTriggerPull={triggerPull}
      />
    ),
    general: () => (
      <SettingsGeneralSection
        scheduleType={scheduleType}
        myTeam={myTeam}
        timeFormat={settings.timeFormat}
        theme={settings.theme}
        locale={getLocale() === "nl" ? "nl" : "en"}
        onScheduleChange={handleScheduleChange}
        onTeamChange={setMyTeam}
        onTimeFormatChange={updateTimeFormat}
        onThemeChange={updateTheme}
        onLocaleChange={setLocale}
      />
    ),
    features: () => (
      <SettingsFeaturesSection
        enableTimeOff={settings.enableTimeOff}
        enableTimeTracking={settings.enableTimeTracking}
        enableGantt={settings.enableGantt}
        enableCrossBorderTracking={settings.enableCrossBorderTracking}
        enableUnifiedCalendar={settings.enableUnifiedCalendar}
        homeCountry={settings.homeCountry ?? null}
        officeCountry={settings.officeCountry ?? null}
        onToggleTimeOff={updateTimeOffEnabled}
        onToggleTimeTracking={updateTimeTrackingEnabled}
        onToggleGantt={updateGanttEnabled}
        onToggleCrossBorderTracking={updateCrossBorderTrackingEnabled}
        onToggleUnifiedCalendar={updateUnifiedCalendarEnabled}
        onUpdateHomeCountry={updateHomeCountry}
        onUpdateOfficeCountry={updateOfficeCountry}
      />
    ),
    about: () => (
      <SettingsAboutSection
        isDevMode={isDevMode}
        onShowChangelog={() => setShowChangelog(true)}
        onShowAboutHelp={() => onShowAbout?.()}
        onShowShortcuts={() => onShowShortcuts?.()}
        onShowDevOptions={() => setShowDevOptions(true)}
      />
    ),
    data: () => (
      <SettingsDataSection
        onShareApp={handleShareApp}
        onShowBackupDialog={() => setShowBackupDialog(true)}
        onRestoreBackup={() => restoreFileInputRef.current?.click()}
        onResetSettings={handleClearData}
      />
    ),
  };
  const sectionContent = sectionRenderers[activeSection]();

  return (
    <>
      <section className="rounded-4 border bg-body shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-bottom bg-body-tertiary">
          <h2 className="h5 mb-1">{m.settings_title()}</h2>
          <p className="text-muted mb-0">{m.settings_page_surface_description()}</p>
        </div>
        <div>{sectionContent}</div>
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
      <ChangelogModal show={showChangelog} onHide={() => setShowChangelog(false)} />

      {/* Developer Options Modal */}
      <DevOptionsPanel show={showDevOptions} onHide={() => setShowDevOptions(false)} />

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
