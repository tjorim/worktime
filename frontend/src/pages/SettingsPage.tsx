import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useVersionClickEasterEgg } from "@/pages/settings/hooks/useVersionClickEasterEgg";
import Button from "react-bootstrap/Button";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAppShellContext } from "@/contexts/AppShellContext";
import { useSettings, type NotificationLeadTimeMinutes } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { usePwaInstall } from "@/contexts/PwaInstallContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStore } from "@/contexts/EventStoreContext";
import { validateAppBackupPayload, restoreAppBackup } from "@/utils/appBackup";
import { logger } from "@/utils/logger";
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
import { SettingsApiTokensSection } from "@/components/settings/account/SettingsApiTokensSection";
import { SettingsAdminUsersSection } from "@/components/settings/admin/SettingsAdminUsersSection";
import { SettingsAboutSection } from "@/components/settings/SettingsAboutSection";
import { SettingsDataSection } from "@/components/settings/data/SettingsDataSection";
import { SettingsFeaturesSection } from "@/components/settings/SettingsFeaturesSection";
import { SettingsGeneralSection } from "@/components/settings/SettingsGeneralSection";
import { SettingsScheduleSection } from "@/components/settings/SettingsScheduleSection";
import { SettingsTimeTrackingSection } from "@/components/settings/SettingsTimeTrackingSection";
import { SettingsSyncSection } from "@/components/settings/account/SettingsSyncSection";
import { useApiClient } from "@/hooks/useApiClient";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { useOngoingSyncContext } from "@/contexts/OngoingSyncContext";
import { useSettingsAccount } from "@/pages/settings/hooks/useSettingsAccount";
import { useSettingsApiTokens } from "@/pages/settings/hooks/useSettingsApiTokens";
import { useSettingsAdminUsers } from "@/pages/settings/hooks/useSettingsAdminUsers";
import { useSettingsSyncStatus } from "@/pages/settings/hooks/useSettingsSyncStatus";
import { useSettingsResetFlow } from "@/pages/settings/hooks/useSettingsResetFlow";
import * as m from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

const SETTINGS_SECTIONS: Array<{
  key: SettingsSection;
  icon: string;
  label: () => string;
  adminOnly?: boolean;
}> = [
  { key: "scheduleTeam", icon: "bi-calendar-week", label: m.schedule_team_section_title },
  { key: "general", icon: "bi-sliders", label: m.preferences_title },
  { key: "features", icon: "bi-grid", label: m.features_title },
  { key: "timeTracking", icon: "bi-clock-history", label: m.time_tracking_section_title },
  { key: "account", icon: "bi-person-circle", label: m.account_section_title },
  { key: "admin", icon: "bi-people", label: m.account_admin_users_title, adminOnly: true },
  { key: "data", icon: "bi-database", label: m.quick_actions_title },
  { key: "about", icon: "bi-info-circle", label: m.information_title },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const { openAbout, openShortcuts } = useAppShellContext();
  const activeSection = search.section ?? "general";
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // validateSearch remaps the deprecated ?section=sync value to "account" internally,
    // but that doesn't rewrite the address bar — do that explicitly so copied
    // links/bookmarks point at the canonical URL going forward.
    if (new URLSearchParams(window.location.search).get("section") === "sync") {
      void navigate({ to: "/settings", search: { section: "account" }, replace: true });
    }
  }, [navigate]);

  const visibleSections = useMemo(
    () => SETTINGS_SECTIONS.filter((section) => !section.adminOnly || isAdmin),
    [isAdmin],
  );

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
                {visibleSections.map((section) => {
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
              onAdminStatusChange={setIsAdmin}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

export type SettingsSection =
  | "scheduleTeam"
  | "general"
  | "features"
  | "timeTracking"
  | "account"
  | "admin"
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
  onAdminStatusChange,
}: {
  onHide: () => void;
  onShowAbout?: () => void;
  onShowShortcuts?: () => void;
  activeSection?: SettingsSection;
  onAdminStatusChange?: (isAdmin: boolean) => void;
}) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { subscribeToPush, unsubscribeFromPush } = usePushSubscription();
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const { clearAll: clearTimeOffEvents } = useEventStore();
  const { isDevMode, toggleDevMode } = useDeveloperOptions();
  const fetchFn = useApiClient();
  const { isAuthenticated, isValidating, userId, displayName, triggerLogin, logout } = useAuth();
  const {
    isSyncing,
    lastSyncedAt,
    outboxCount,
    hasSyncError,
    conflictCount,
    retryAfter,
    triggerPull,
  } = useOngoingSyncContext();
  const {
    settings,
    scheduleType,
    myTeam,
    setMyTeam,
    setScheduleType,
    updateTimeFormat,
    updateTheme,
    updateNotifications,
    updateNotificationLeadTime,
    updateNotificationQuietHours,
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
  const isAdmin = accountProfile?.is_admin ?? false;
  const {
    apiTokens,
    isApiTokensLoading,
    apiTokensError,
    isCreatingApiToken,
    createApiTokenError,
    createdApiToken,
    dismissCreatedApiToken,
    handleCreateApiToken,
    revokingApiTokenId,
    revokeApiTokenError,
    handleRevokeApiToken,
  } = useSettingsApiTokens({
    isAuthenticated,
    fetchFn,
  });
  const {
    adminUsers,
    isAdminUsersLoading,
    adminUsersError,
    adminUsersDeleteError,
    deletingAdminUserId,
    handleDeleteAdminUser,
  } = useSettingsAdminUsers({
    isAuthenticated,
    isAdmin,
    currentAccountId: accountProfile?.id ?? null,
    fetchFn,
    showSuccessToast: toast.showSuccess,
  });

  useEffect(() => {
    onAdminStatusChange?.(isAdmin);
  }, [isAdmin, onAdminStatusChange]);
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
    isAuthenticated,
    accountId: userId,
    fetchFn,
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
    let parsed: unknown;
    try {
      const text = await file.text();
      parsed = JSON.parse(text);
    } catch {
      toast.showError(m.restore_failed());
      event.target.value = "";
      return;
    }
    if (!validateAppBackupPayload(parsed)) {
      toast.showError(m.restore_failed());
      event.target.value = "";
      return;
    }
    setIsRestoringBackup(true);
    try {
      // Reloads the page on success, so this only returns for a failed sync
      // push — the local restore itself already landed.
      await restoreAppBackup(parsed, isAuthenticated ? fetchFn : undefined);
    } catch (err) {
      logger.error("Backup restore's sync push failed:", err);
      toast.showError(m.restore_sync_failed());
      setIsRestoringBackup(false);
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

  const handleNotificationsChange = async (enabled: boolean) => {
    if (!enabled) {
      updateNotifications("off");
      void unsubscribeFromPush();
      return;
    }
    if (typeof Notification === "undefined") {
      toast?.showWarning(m.notifications_unsupported());
      return;
    }
    if (Notification.permission === "denied") {
      toast?.showWarning(m.notifications_permission_denied());
      return;
    }
    const permission =
      Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission !== "granted") {
      toast?.showWarning(m.notifications_permission_denied());
      return;
    }
    updateNotifications("on");
    // Best-effort: push works when the app is closed, but the foreground
    // reminder (already enabled above) covers the open-tab case regardless
    // of whether this succeeds (unsupported browser, push not configured
    // server-side, not signed in, etc).
    if (isAuthenticated) {
      void subscribeToPush({
        leadTimeMinutes: settings.notificationLeadTimeMinutes,
        quietHoursStart: settings.notificationQuietHoursStart,
        quietHoursEnd: settings.notificationQuietHoursEnd,
      });
    }
  };

  const handleNotificationLeadTimeChange = (minutes: NotificationLeadTimeMinutes) => {
    updateNotificationLeadTime(minutes);
    if (settings.notifications === "on" && isAuthenticated) {
      void subscribeToPush({
        leadTimeMinutes: minutes,
        quietHoursStart: settings.notificationQuietHoursStart,
        quietHoursEnd: settings.notificationQuietHoursEnd,
      });
    }
  };

  const handleNotificationQuietHoursChange = (range: { start: number; end: number } | null) => {
    updateNotificationQuietHours(range);
    if (settings.notifications === "on" && isAuthenticated) {
      void subscribeToPush({
        leadTimeMinutes: settings.notificationLeadTimeMinutes,
        quietHoursStart: range?.start ?? null,
        quietHoursEnd: range?.end ?? null,
      });
    }
  };

  const handleShareApp = () => {
    shareApp(
      () => toast?.showSuccess(m.share_success()),
      () => toast?.showError(m.share_failed()),
    );
  };

  const handleInstallApp = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted") {
      toast?.showSuccess(m.pwa_install_success());
    } else if (outcome === "unavailable") {
      toast?.showWarning(m.pwa_install_unavailable_toast());
    }
  };

  const sectionRenderers: Record<SettingsSection, () => ReactNode> = {
    account: () => (
      <>
        <SettingsAccountSection
          isValidating={isValidating}
          isAuthenticated={isAuthenticated}
          resolvedDisplayName={resolvedDisplayName}
          username={accountProfile?.username ?? null}
          accountId={accountProfile?.id ?? null}
          userId={userId}
          isAdmin={isAdmin}
          profileError={profileError}
          isProfileLoading={isProfileLoading}
          profileDraft={profileDraft}
          isProfileSaving={isProfileSaving}
          hasProfileChanges={hasProfileChanges}
          onProfileDraftChange={setProfileDraft}
          onSaveProfile={() => void handleSaveProfile()}
          isDeletingAccount={isDeletingAccount}
          deleteAccountError={deleteAccountError}
          onDeleteAccount={() => void handleDeleteAccount()}
          onLogout={logout}
          onLogin={triggerLogin}
        />
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
        {isAuthenticated ? (
          <SettingsApiTokensSection
            apiTokens={apiTokens}
            isApiTokensLoading={isApiTokensLoading}
            apiTokensError={apiTokensError}
            isCreatingApiToken={isCreatingApiToken}
            createApiTokenError={createApiTokenError}
            createdApiToken={createdApiToken}
            onDismissCreatedApiToken={dismissCreatedApiToken}
            onCreateApiToken={handleCreateApiToken}
            revokingApiTokenId={revokingApiTokenId}
            revokeApiTokenError={revokeApiTokenError}
            onRevokeApiToken={handleRevokeApiToken}
          />
        ) : null}
      </>
    ),
    admin: () =>
      isAdmin ? (
        <SettingsAdminUsersSection
          currentAccountId={accountProfile?.id ?? null}
          adminUsers={adminUsers}
          isAdminUsersLoading={isAdminUsersLoading}
          adminUsersError={adminUsersError}
          adminUsersDeleteError={adminUsersDeleteError}
          deletingAdminUserId={deletingAdminUserId}
          onDeleteAdminUser={(userId) => void handleDeleteAdminUser(userId)}
        />
      ) : null,
    scheduleTeam: () => (
      <SettingsScheduleSection
        scheduleType={scheduleType}
        myTeam={myTeam}
        onScheduleChange={handleScheduleChange}
        onTeamChange={setMyTeam}
      />
    ),
    general: () => (
      <SettingsGeneralSection
        timeFormat={settings.timeFormat}
        theme={settings.theme}
        locale={getLocale() === "nl" ? "nl" : "en"}
        notificationsEnabled={settings.notifications === "on"}
        notificationLeadTimeMinutes={settings.notificationLeadTimeMinutes}
        notificationQuietHoursStart={settings.notificationQuietHoursStart}
        notificationQuietHoursEnd={settings.notificationQuietHoursEnd}
        onTimeFormatChange={updateTimeFormat}
        onThemeChange={updateTheme}
        onLocaleChange={setLocale}
        onNotificationsChange={(enabled) => void handleNotificationsChange(enabled)}
        onNotificationLeadTimeChange={handleNotificationLeadTimeChange}
        onNotificationQuietHoursChange={handleNotificationQuietHoursChange}
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
    timeTracking: () => <SettingsTimeTrackingSectionContainer />,
    about: () => (
      <SettingsAboutSection
        isDevMode={isDevMode}
        onShareApp={handleShareApp}
        canInstallApp={canInstall}
        isAppInstalled={isInstalled}
        onInstallApp={() => void handleInstallApp()}
        onShowChangelog={() => setShowChangelog(true)}
        onShowAboutHelp={() => onShowAbout?.()}
        onShowShortcuts={() => onShowShortcuts?.()}
        onShowDevOptions={() => setShowDevOptions(true)}
      />
    ),
    data: () => (
      <SettingsDataSection
        onShowBackupDialog={() => setShowBackupDialog(true)}
        onRestoreBackup={() => restoreFileInputRef.current?.click()}
        isRestoringBackup={isRestoringBackup}
        onResetSettings={handleClearData}
      />
    ),
  };
  const sectionContent = sectionRenderers[activeSection]();

  return (
    <>
      <section className="rounded-4 border bg-body shadow-sm overflow-hidden">
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

/**
 * Mounts `useTimeTrackingStorage` only while the Time Tracking settings
 * section is active, so opening unrelated sections doesn't trigger the
 * labels/templates/tasks sync collections' network pulls.
 */
function SettingsTimeTrackingSectionContainer() {
  const {
    tasks,
    templates,
    labels,
    addTemplate,
    updateTemplate,
    deleteTemplate,
    updateTemplates,
    updateLabels,
  } = useTimeTrackingStorage();

  return (
    <SettingsTimeTrackingSection
      labels={labels}
      templates={templates}
      tasks={tasks}
      onAddTemplate={addTemplate}
      onUpdateTemplate={updateTemplate}
      onDeleteTemplate={deleteTemplate}
      onUpdateTemplates={updateTemplates}
      onUpdateLabels={updateLabels}
    />
  );
}
