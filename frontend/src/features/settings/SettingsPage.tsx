import {
  CalendarDaysIcon,
  CircleUserIcon,
  DatabaseIcon,
  InfoIcon,
  LayoutGridIcon,
  type LucideIcon,
  RotateCcwClockIcon,
  PlugIcon,
  SlidersHorizontalIcon,
  UsersIcon,
} from "lucide-react";
import { Icon } from "@/components/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useAppShellContext } from "@/app/providers/AppShellContext";
import { useSettings } from "@/app/providers/SettingsContext";
import { useToast } from "@/app/providers/ToastContext";
import { usePwaInstall } from "@/app/providers/PwaInstallContext";
import { useAuth } from "@/app/providers/AuthContext";
import { useEventStore } from "@/app/providers/EventStoreContext";
import {
  getAppBackupValidationError,
  preloadAppBackupCollections,
  validateAppBackupPayload,
  restoreAppBackup,
} from "@/features/settings/appBackup";
import { logger } from "@/lib/logger";
import { BackupDialog } from "@/features/settings/BackupDialog";
import { CONFIG } from "@/config/app";
import { useGanttTasks } from "@/hooks/useGanttTasks";
import { useScheduleChange } from "@/hooks/useScheduleChange";
import { shareApp } from "@/features/settings/share";
import { ChangelogModal } from "@/features/settings/ChangelogModal";
import { ResetSettingsModal } from "@/features/settings/data/ResetSettingsModal";
import { SettingsAccountExportRow } from "@/features/settings/data/SettingsAccountExportRow";
import {
  SettingsAccountDangerSection,
  SettingsAccountSection,
} from "@/features/settings/account/SettingsAccountSection";
import { SettingsLoading } from "@/features/settings/SettingsParts";
import { SettingsConnectionsSection } from "@/features/settings/account/SettingsConnectionsSection";
import { SettingsHdayHelper } from "@/features/settings/SettingsHdayHelper";
import { SettingsAuditTrailSection } from "@/features/settings/account/SettingsAuditTrailSection";
import { SettingsAdminUsersSection } from "@/features/settings/admin/SettingsAdminUsersSection";
import { SettingsAboutSection } from "@/features/settings/SettingsAboutSection";
import { SettingsDataSection } from "@/features/settings/data/SettingsDataSection";
import { SettingsFeaturesSection } from "@/features/settings/SettingsFeaturesSection";
import { SettingsGeneralSection } from "@/features/settings/SettingsGeneralSection";
import { SettingsScheduleSection } from "@/features/settings/SettingsScheduleSection";
import { SettingsTimeTrackingSection } from "@/features/settings/SettingsTimeTrackingSection";
import { SettingsSyncSection } from "@/features/settings/account/SettingsSyncSection";
import { useApiClient } from "@/hooks/useApiClient";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useTimeTrackingStorage } from "@/hooks/useTimeTrackingStorage";
import { useOngoingSyncContext } from "@/app/providers/OngoingSyncContext";
import { useSettingsApiTokens } from "@/features/settings/hooks/useSettingsApiTokens";
import { useSettingsIntegrationClients } from "@/features/settings/hooks/useSettingsIntegrationClients";
import { useSettingsAccount } from "@/features/settings/hooks/useSettingsAccount";
import { useSettingsAdminUsers } from "@/features/settings/hooks/useSettingsAdminUsers";
import { useSettingsAuditTrail } from "@/features/settings/hooks/useSettingsAuditTrail";
import { useSettingsSyncStatus } from "@/features/settings/hooks/useSettingsSyncStatus";
import { useSettingsResetFlow } from "@/features/settings/hooks/useSettingsResetFlow";
import * as m from "@/paraglide/messages.js";
import { getLocale, setLocale } from "@/paraglide/runtime.js";

const SETTINGS_SECTIONS: Array<{
  key: SettingsSection;
  icon: LucideIcon;
  label: () => string;
  adminOnly?: boolean;
}> = [
  { key: "scheduleTeam", icon: CalendarDaysIcon, label: m.schedule_team_section_title },
  { key: "general", icon: SlidersHorizontalIcon, label: m.preferences_title },
  { key: "features", icon: LayoutGridIcon, label: m.features_title },
  { key: "timeTracking", icon: RotateCcwClockIcon, label: m.time_tracking_section_title },
  { key: "account", icon: CircleUserIcon, label: m.account_section_title },
  { key: "connections", icon: PlugIcon, label: m.settings_connections_title },
  { key: "activity", icon: RotateCcwClockIcon, label: m.audit_trail_title },
  { key: "admin", icon: UsersIcon, label: m.account_admin_users_title, adminOnly: true },
  { key: "data", icon: DatabaseIcon, label: m.quick_actions_title },
  { key: "about", icon: InfoIcon, label: m.information_title },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const { openAbout, openShortcuts } = useAppShellContext();
  const { isAuthenticated, userId } = useAuth();
  const { showWarning } = useToast();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const requestedSection = search.section ?? "scheduleTeam";
  const activeSection = resolveSettingsSection(requestedSection, isAdmin === true);

  useEffect(() => {
    if (requestedSection === activeSection) return;
    // Keep admin deep links while the account profile is still loading.
    if (requestedSection === "admin" && isAdmin === null) return;
    // Say why the page changed instead of silently landing somewhere else.
    if (requestedSection === "admin" && isAdmin === false) {
      showWarning(m.settings_section_unavailable());
    }
    void navigate({
      to: "/settings",
      search: { section: activeSection },
      replace: true,
    });
  }, [requestedSection, activeSection, isAdmin, navigate, showWarning]);

  const visibleSections = useMemo(
    () =>
      SETTINGS_SECTIONS.filter(
        (section) => !section.adminOnly || (isAdmin && section.key === activeSection),
      ),
    [isAdmin, activeSection],
  );

  const sectionMeta = useMemo(() => {
    const matchedSection = SETTINGS_SECTIONS.find((section) => section.key === activeSection);
    return matchedSection ?? SETTINGS_SECTIONS[0]!;
  }, [activeSection]);

  return (
    <main id="main-content" className="py-6">
      <div className="mx-auto max-w-settings">
        <div className="mb-3 rounded-2xl border border-border bg-muted px-4 py-3 md:mb-4 md:px-8 md:py-4">
          <div className="mb-1 text-sm font-semibold text-muted-foreground uppercase md:mb-2">
            {m.settings_title()}
          </div>
          <h1 className="m-0 text-2xl font-medium md:text-3xl">{sectionMeta.label()}</h1>
        </div>

        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12 lg:gap-4">
          <Card className="gap-2 p-3 shadow-sm lg:hidden">
            <Label
              htmlFor="settings-section-select"
              className="text-sm font-semibold text-muted-foreground uppercase"
            >
              {m.settings_page_nav_title()}
            </Label>
            <NativeSelect
              id="settings-section-select"
              className="h-10 w-full"
              value={activeSection}
              onChange={(event) =>
                void navigate({
                  to: "/settings",
                  search: { section: event.target.value as SettingsSection },
                })
              }
            >
              {visibleSections.map((section) => (
                <option key={section.key} value={section.key}>
                  {section.label()}
                </option>
              ))}
            </NativeSelect>
          </Card>

          <Card className="hidden gap-0 py-0 shadow-sm lg:col-span-4 lg:block xl:col-span-3">
            <nav aria-label={m.settings_page_nav_title()}>
              <div className="border-b border-border bg-muted px-4 py-3 text-sm font-semibold text-muted-foreground uppercase">
                {m.settings_page_nav_title()}
              </div>
              <div className="grid gap-2 p-2">
                {visibleSections.map((section) => {
                  const isActive = section.key === activeSection;
                  return (
                    <Button
                      key={section.key}
                      variant={isActive ? "default" : "outline"}
                      size="lg"
                      className="justify-start gap-2 text-left"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() =>
                        void navigate({
                          to: "/settings",
                          search: { section: section.key },
                        })
                      }
                    >
                      <Icon icon={section.icon} />
                      <span>{section.label()}</span>
                    </Button>
                  );
                })}
              </div>
            </nav>
          </Card>

          <div className="min-w-0 lg:col-span-8 xl:col-span-9">
            <SettingsContent
              key={isAuthenticated ? userId : null}
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

function resolveSettingsSection(section: unknown, isAdmin: boolean): SettingsSection {
  return (
    SETTINGS_SECTIONS.find(
      (candidate) => candidate.key === section && (!candidate.adminOnly || isAdmin),
    )?.key ?? "scheduleTeam"
  );
}

export type SettingsSection =
  | "scheduleTeam"
  | "general"
  | "features"
  | "timeTracking"
  | "account"
  | "connections"
  | "activity"
  | "admin"
  | "data"
  | "about";

/**
 * Renders the settings content for the selected section in the settings page layout.
 *
 * @param onHide - Callback invoked when a settings action should close the page
 * @param onShowAbout - Optional callback invoked to open the global About experience
 * @param onShowShortcuts - Optional callback invoked to open the global keyboard shortcuts overlay
 * @param activeSection - Active settings section key; defaults to "scheduleTeam" when unset
 * @returns Rendered settings page content
 */
export function SettingsContent({
  onHide,
  onShowAbout,
  onShowShortcuts,
  activeSection = "scheduleTeam",
  onAdminStatusChange,
}: {
  onHide: () => void;
  onShowAbout?: () => void;
  onShowShortcuts?: () => void;
  activeSection?: SettingsSection;
  onAdminStatusChange?: (isAdmin: boolean | null) => void;
}) {
  const [showChangelog, setShowChangelog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const { subscribeToPush, unsubscribeFromPush } = usePushSubscription();
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const { clearAll: clearTimeOffEvents } = useEventStore();
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
    updateTimeFormat,
    updateTheme,
    appearance,
    updateHighContrast,
    updateNotifications,
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
    profileLoadFailed,
    retryProfile,
    applyUsername,
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
  // Keep one-time credentials and in-flight mutations alive across section changes.
  const loadConnections = activeSection === "connections";
  const apiTokenSettings = useSettingsApiTokens({
    isAuthenticated,
    loadEnabled: loadConnections,
    fetchFn,
  });
  const integrationClients = useSettingsIntegrationClients({
    isAuthenticated,
    accountIdentity: userId,
    loadEnabled: loadConnections,
    fetchFn,
  });
  const {
    adminUsers,
    isAdminUsersLoading,
    adminUsersError,
    adminUsersDeleteError,
    deletingAdminUserId,
    handleRenameAdminUser,
    handleDeleteAdminUser,
  } = useSettingsAdminUsers({
    isAuthenticated,
    isAdmin,
    currentAccountId: accountProfile?.id ?? null,
    fetchFn,
    showSuccessToast: toast.showSuccess,
  });
  const personalAuditTrail = useSettingsAuditTrail({
    enabled: activeSection === "activity" && isAuthenticated && accountProfile?.id !== undefined,
    userId: accountProfile?.id,
    fetchFn,
  });
  const teamAuditTrail = useSettingsAuditTrail({
    enabled: activeSection === "admin" && isAuthenticated && isAdmin,
    resourceOwnerId: accountProfile?.id,
    fetchFn,
  });

  useEffect(() => {
    // The role stays unknown while the profile is loading or failed to load, so an admin
    // deep link is kept and only replaced once access is confirmed unavailable.
    const status = isValidating || (isAuthenticated && !accountProfile) ? null : isAdmin;
    onAdminStatusChange?.(status);
  }, [isAdmin, isValidating, isAuthenticated, accountProfile, onAdminStatusChange]);
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
    try {
      await preloadAppBackupCollections(parsed);
    } catch (error) {
      logger.error("Failed to load backup reference targets:", error);
      toast.showError(m.restore_failed());
      event.target.value = "";
      return;
    }
    const validationError = getAppBackupValidationError(parsed);
    if (!validateAppBackupPayload(parsed)) {
      const sectionLabels: Record<string, string> = {
        version: m.restore_backup_format(),
        userState: m.backup_include_settings(),
        tasks: m.backup_include_tasks(),
        templates: m.backup_include_templates(),
        labels: m.backup_include_templates(),
        ganttTasks: m.backup_include_gantt(),
        timeOff: m.backup_include_time_off(),
        workLocations: m.backup_include_work_locations(),
      };
      toast.showError(
        m.restore_invalid_record({
          section: sectionLabels[validationError?.section ?? "version"]!,
          record: validationError?.record ?? 0,
        }),
      );
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

  const handleScheduleChange = useScheduleChange();

  const handleNotificationsChange = async (enabled: boolean) => {
    if (!enabled) {
      updateNotifications(false);
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
    updateNotifications(true);
    // Best-effort: push works when the app is closed, but the foreground
    // reminder (already enabled above) covers the open-tab case regardless
    // of whether this succeeds (unsupported browser, push not configured
    // server-side, not signed in, etc).
    if (isAuthenticated) {
      void subscribeToPush();
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
          onRetryProfile={profileLoadFailed ? retryProfile : undefined}
          profileError={profileError}
          isProfileLoading={isProfileLoading}
          profileDraft={profileDraft}
          isProfileSaving={isProfileSaving}
          hasProfileChanges={hasProfileChanges}
          onProfileDraftChange={setProfileDraft}
          onSaveProfile={() => void handleSaveProfile()}
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
        {isAdmin ? (
          <div className="px-4 py-3">
            <Link to="/settings" search={{ section: "admin" }}>
              {m.account_admin_users_title()}
            </Link>
          </div>
        ) : null}
        {isAuthenticated ? (
          <SettingsAccountDangerSection
            isDeletingAccount={isDeletingAccount}
            deleteAccountError={deleteAccountError}
            onDeleteAccount={() => void handleDeleteAccount()}
          />
        ) : null}
      </>
    ),
    connections: () => (
      <>
        {isAuthenticated ? (
          <SettingsConnectionsSection
            isAdmin={isAdmin}
            apiTokenSettings={apiTokenSettings}
            integrationClients={integrationClients}
            fetchFn={fetchFn}
          />
        ) : (
          <p className="px-4 py-3 text-muted-foreground">{m.settings_connections_signed_out()}</p>
        )}
        <SettingsHdayHelper />
      </>
    ),
    activity: () =>
      isValidating || (isAuthenticated && !accountProfile && !profileError) ? (
        <SettingsLoading>{m.loading()}</SettingsLoading>
      ) : isAuthenticated && accountProfile ? (
        <SettingsAuditTrailSection
          {...personalAuditTrail}
          users={[accountProfile]}
          onLoadMore={() => void personalAuditTrail.loadMore()}
        />
      ) : isAuthenticated && profileError ? (
        <div className="space-y-2 p-4">
          <Alert variant="warning">{profileError}</Alert>
          <Button variant="outline" size="sm" onClick={retryProfile}>
            {m.sync_retry_in_label()}
          </Button>
        </div>
      ) : (
        <p className="px-4 py-3 text-muted-foreground">{m.settings_activity_signed_out()}</p>
      ),
    admin: () =>
      isAdmin ? (
        <>
          <SettingsAdminUsersSection
            currentAccountId={accountProfile?.id ?? null}
            adminUsers={adminUsers}
            isAdminUsersLoading={isAdminUsersLoading}
            adminUsersError={adminUsersError}
            adminUsersDeleteError={adminUsersDeleteError}
            deletingAdminUserId={deletingAdminUserId}
            onRenameAdminUser={(id, username) =>
              handleRenameAdminUser(id, username, (user) => {
                applyUsername(user);
                teamAuditTrail.reload();
              })
            }
            onDeleteAdminUser={(userId) => void handleDeleteAdminUser(userId)}
          />
          <SettingsAuditTrailSection
            {...teamAuditTrail}
            users={adminUsers}
            teamWide
            onLoadMore={() => void teamAuditTrail.loadMore()}
          />
        </>
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
        highContrast={appearance.highContrast}
        onHighContrastChange={updateHighContrast}
        locale={getLocale() === "nl" ? "nl" : "en"}
        notificationsEnabled={settings.notifications}
        onTimeFormatChange={updateTimeFormat}
        onThemeChange={updateTheme}
        onLocaleChange={setLocale}
        onNotificationsChange={(enabled) => void handleNotificationsChange(enabled)}
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
        onShareApp={handleShareApp}
        canInstallApp={canInstall}
        isAppInstalled={isInstalled}
        onInstallApp={() => void handleInstallApp()}
        onShowChangelog={() => setShowChangelog(true)}
        onShowAboutHelp={() => onShowAbout?.()}
        onShowShortcuts={() => onShowShortcuts?.()}
      />
    ),
    data: () => (
      <SettingsDataSection
        accountExport={
          <SettingsAccountExportRow
            accountId={accountProfile?.id ?? null}
            isAuthenticated={isAuthenticated}
            fetchFn={fetchFn}
          />
        }
        onShowBackupDialog={() => setShowBackupDialog(true)}
        onRestoreBackup={() => restoreFileInputRef.current?.click()}
        isRestoringBackup={isRestoringBackup}
        onResetSettings={handleClearData}
      />
    ),
  };
  const sectionContent = sectionRenderers[resolveSettingsSection(activeSection, isAdmin)]();

  return (
    <>
      <Card className="gap-0 py-0 shadow-sm">
        <div key={activeSection} className="app-view-enter">
          {sectionContent}
        </div>
        <div className="border-t border-border px-4 py-3 text-center text-muted-foreground">
          <span className="block">{m.footer_version({ version: CONFIG.VERSION })}</span>
          <small>{m.footer_built_by()}</small>
        </div>
      </Card>

      {/* Changelog Modal */}
      <ChangelogModal show={showChangelog} onHide={() => setShowChangelog(false)} />

      {/* Backup Dialog */}
      <BackupDialog show={showBackupDialog} onHide={() => setShowBackupDialog(false)} />

      {/* Hidden file input for restore */}
      <input
        ref={restoreFileInputRef}
        type="file"
        accept="application/json"
        className="hidden"
        aria-label={m.restore_backup_label()}
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
    reassignAndDeleteLabel,
  } = useTimeTrackingStorage();
  const { tasks: ganttTasks } = useGanttTasks();

  return (
    <SettingsTimeTrackingSection
      labels={labels}
      templates={templates}
      tasks={tasks}
      ganttTasks={ganttTasks}
      onAddTemplate={addTemplate}
      onUpdateTemplate={updateTemplate}
      onDeleteTemplate={deleteTemplate}
      onUpdateTemplates={updateTemplates}
      onUpdateLabels={updateLabels}
      onReassignAndDeleteLabel={reassignAndDeleteLabel}
    />
  );
}
