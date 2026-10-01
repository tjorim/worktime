import {
  CalendarDays as CalendarDaysIcon,
  CircleUser as CircleUserIcon,
  Database as DatabaseIcon,
  History as HistoryIcon,
  Info as InfoIcon,
  LayoutGrid as LayoutGridIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  Users as UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { Icon } from "@/components/shared/Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useAppShellContext } from "@/contexts/AppShellContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useToast } from "@/contexts/ToastContext";
import { usePwaInstall } from "@/contexts/PwaInstallContext";
import { useAuth } from "@/contexts/AuthContext";
import { useEventStore } from "@/contexts/EventStoreContext";
import { validateAppBackupPayload, restoreAppBackup } from "@/utils/appBackup";
import { logger } from "@/utils/logger";
import { BackupDialog } from "@/components/BackupDialog";
import { CONFIG } from "@/utils/config";
import { getScheduleChangeTeamAction } from "@/utils/scheduleUtils";
import { type ScheduleOption } from "@/data/rosters";
import { shareApp } from "@/utils/share";
import { ChangelogModal } from "@/components/ChangelogModal";
import { ResetSettingsModal } from "@/components/settings/data/ResetSettingsModal";
import { SettingsAccountSection } from "@/components/settings/account/SettingsAccountSection";
import { SettingsApiTokensSection } from "@/components/settings/account/SettingsApiTokensSection";
import { SettingsCalendarFeedSection } from "@/components/settings/account/SettingsCalendarFeedSection";
import { SettingsIntegrationClientsSection } from "@/components/settings/account/SettingsIntegrationClientsSection";
import { SettingsAuditTrailSection } from "@/components/settings/account/SettingsAuditTrailSection";
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
import { useSettingsIntegrationClients } from "@/pages/settings/hooks/useSettingsIntegrationClients";
import { useSettingsAdminUsers } from "@/pages/settings/hooks/useSettingsAdminUsers";
import { useSettingsAuditTrail } from "@/pages/settings/hooks/useSettingsAuditTrail";
import { useSettingsSyncStatus } from "@/pages/settings/hooks/useSettingsSyncStatus";
import { useSettingsResetFlow } from "@/pages/settings/hooks/useSettingsResetFlow";
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
  { key: "timeTracking", icon: HistoryIcon, label: m.time_tracking_section_title },
  { key: "account", icon: CircleUserIcon, label: m.account_section_title },
  { key: "admin", icon: UsersIcon, label: m.account_admin_users_title, adminOnly: true },
  { key: "data", icon: DatabaseIcon, label: m.quick_actions_title },
  { key: "about", icon: InfoIcon, label: m.information_title },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/settings" });
  const { openAbout, openShortcuts } = useAppShellContext();
  const activeSection = search.section ?? "scheduleTeam";
  const [isAdmin, setIsAdmin] = useState(false);

  const visibleSections = useMemo(
    () => SETTINGS_SECTIONS.filter((section) => !section.adminOnly || isAdmin),
    [isAdmin],
  );

  const sectionMeta = useMemo(() => {
    const matchedSection = SETTINGS_SECTIONS.find((section) => section.key === activeSection);
    return matchedSection ?? SETTINGS_SECTIONS[0]!;
  }, [activeSection]);

  return (
    <main id="main-content" className="tw:py-6">
      <div className="tw:mx-auto tw:max-w-settings">
        <div className="tw:mb-3 tw:rounded-2xl tw:border tw:border-border tw:bg-muted tw:px-4 tw:py-3 tw:md:mb-4 tw:md:px-8 tw:md:py-4">
          <div className="tw:mb-1 tw:text-sm tw:font-semibold tw:text-muted-foreground tw:uppercase tw:md:mb-2">
            {m.settings_title()}
          </div>
          <h1 className="tw:m-0 tw:text-2xl tw:font-medium tw:md:mb-2 tw:md:text-3xl">
            {sectionMeta.label()}
          </h1>
          <p className="tw:m-0 tw:hidden tw:text-muted-foreground tw:md:block">
            {m.settings_page_description()}
          </p>
        </div>

        <div className="tw:grid tw:grid-cols-1 tw:items-start tw:gap-3 tw:lg:grid-cols-12 tw:lg:gap-4">
          <Card className="tw:gap-2 tw:p-3 tw:shadow-sm tw:lg:hidden">
            <Label
              htmlFor="settings-section-select"
              className="tw:text-sm tw:font-semibold tw:text-muted-foreground tw:uppercase"
            >
              {m.settings_page_nav_title()}
            </Label>
            <NativeSelect
              id="settings-section-select"
              className="tw:h-10 tw:w-full"
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

          <Card className="tw:hidden tw:gap-0 tw:py-0 tw:shadow-sm tw:lg:col-span-4 tw:lg:block tw:xl:col-span-3">
            <nav aria-label={m.settings_page_nav_title()}>
              <div className="tw:border-b tw:border-border tw:bg-muted tw:px-4 tw:py-3 tw:text-sm tw:font-semibold tw:text-muted-foreground tw:uppercase">
                {m.settings_page_nav_title()}
              </div>
              <div className="tw:grid tw:gap-2 tw:p-2">
                {visibleSections.map((section) => {
                  const isActive = section.key === activeSection;
                  return (
                    <Button
                      key={section.key}
                      variant={isActive ? "default" : "outline"}
                      size="lg"
                      className="tw:justify-start tw:gap-2 tw:text-left"
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

          <div className="tw:min-w-0 tw:lg:col-span-8 tw:xl:col-span-9">
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
  onAdminStatusChange?: (isAdmin: boolean) => void;
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
    setScheduleType,
    updateTimeFormat,
    updateTheme,
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
  const integrationClients = useSettingsIntegrationClients({
    isAuthenticated,
    accountIdentity: userId,
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
  const personalAuditTrail = useSettingsAuditTrail({
    enabled: activeSection === "account" && isAuthenticated && accountProfile?.id !== undefined,
    userId: accountProfile?.id,
    fetchFn,
  });
  const teamAuditTrail = useSettingsAuditTrail({
    enabled: activeSection === "admin" && isAuthenticated && isAdmin,
    fetchFn,
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
    const teamAction = getScheduleChangeTeamAction(scheduleType, schedule, myTeam);
    if (teamAction !== "keep") {
      setMyTeam(null);
      if (teamAction === "clear-and-prompt") {
        toast?.showInfo(m.schedule_team_reset_changed());
      }
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
          <>
            <SettingsAuditTrailSection
              {...personalAuditTrail}
              onLoadMore={() => void personalAuditTrail.loadMore()}
            />
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
            <SettingsCalendarFeedSection fetchFn={fetchFn} />
            <SettingsIntegrationClientsSection
              clients={integrationClients.clients}
              isLoading={integrationClients.isLoading}
              error={integrationClients.error}
              isCreating={integrationClients.isCreating}
              createdClient={integrationClients.createdClient}
              busyClientId={integrationClients.busyClientId}
              isAdmin={isAdmin}
              onDismissCreatedClient={integrationClients.dismissCreatedClient}
              onCreateClient={integrationClients.createClient}
              onRotateClient={integrationClients.rotateClient}
              onRevokeClient={integrationClients.revokeClient}
            />
          </>
        ) : null}
      </>
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
            onDeleteAdminUser={(userId) => void handleDeleteAdminUser(userId)}
          />
          <SettingsAuditTrailSection
            {...teamAuditTrail}
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
        locale={getLocale() === "nl" ? "nl" : "en"}
        notificationsEnabled={settings.notifications === "on"}
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
      <Card className="tw:gap-0 tw:py-0 tw:shadow-sm">
        <div key={activeSection} className="app-view-enter">
          {sectionContent}
        </div>
        <div className="tw:border-t tw:border-border tw:px-4 tw:py-3 tw:text-center tw:text-muted-foreground">
          <span className="tw:block">{m.footer_version({ version: CONFIG.VERSION })}</span>
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
        className="tw:hidden"
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
