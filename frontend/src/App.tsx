import { useCallback, useEffect, useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { queryClient } from "@/lib/queryClient";
import { AuthProvider as OidcAuthProvider } from "react-oidc-context";
import { oidcConfig } from "@/config/oidc";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { PwaUpdateToast } from "@/components/PwaUpdateToast";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { AppShellProvider } from "@/contexts/AppShellContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { OngoingSyncProvider } from "@/contexts/OngoingSyncContext";
import type { WizardCompletionPayload } from "@/components/WelcomeWizard";
import { SettingsProvider, type TabKey, useSettings } from "@/contexts/SettingsContext";
import { useLastUsed } from "@/contexts/LastUsedContext";
import { ToastProvider, useToast } from "@/contexts/ToastContext";
import { DeveloperOptionsProvider } from "@/contexts/DeveloperOptionsContext";
import { PwaInstallProvider } from "@/contexts/PwaInstallContext";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "@/data/rosters";
import { useShiftCalculation } from "@/hooks/useShiftCalculation";
import { useShiftNotifications } from "@/hooks/useShiftNotifications";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useApiClient } from "@/hooks/useApiClient";
import { useFirstSyncFlow } from "@/hooks/useFirstSyncFlow";
import { getScheduleConfig } from "@/utils/scheduleUtils";

import * as m from "@/paraglide/messages.js";
import { router } from "@/router";
import { logger } from "@/utils/logger";

/**
 * The main application component for team selection and shift management.
 *
 * Coordinates team selection, loading state, and tab navigation, and renders the primary UI for viewing and managing shift information.
 *
 * @returns The application's rendered user interface.
 */
function AppContent() {
  const { showSuccess, showInfo, showError } = useToast();
  const { isAuthenticated, userId } = useAuth();
  const {
    myTeam,
    setMyTeam,
    hasCompletedOnboarding,
    accountSyncAnnouncementSeen,
    setAccountSyncAnnouncementSeen,
    ganttAnnouncementSeen,
    setGanttAnnouncementSeen,
    crossBorderAnnouncementSeen,
    setCrossBorderAnnouncementSeen,
    completeOnboardingWithSchedule,
    scheduleType,
    setScheduleType,
    settings,
  } = useSettings();
  const { lastUsed, updateLastActiveTab } = useLastUsed();
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamModalMode, setTeamModalMode] = useState<
    "onboarding" | "change-team" | "change-schedule"
  >("onboarding");

  // useApiClient must be called unconditionally (React rules of hooks).
  // The result is only passed to the sync flow when the user is authenticated.
  const apiFetch = useApiClient();
  const fetchFnOrNull = isAuthenticated ? apiFetch : null;

  const {
    phase: syncPhase,
    isSyncEstablished,
    resolveConflict,
    conflictCounts: syncConflictCounts,
    dismiss: dismissSync,
  } = useFirstSyncFlow(isAuthenticated, userId, fetchFnOrNull);

  // Show a toast for each phase of the first-sync flow.
  useEffect(() => {
    switch (syncPhase) {
      case "checking":
        showInfo(m.first_sync_checking());
        break;
      case "pushing":
        showInfo(m.first_sync_pushing());
        break;
      case "pulling":
        showInfo(m.first_sync_pulling());
        break;
      case "done":
        showSuccess(m.first_sync_done(), "bi-cloud-check-fill");
        break;
      case "error":
        showError(m.first_sync_error());
        break;
      default:
        break;
    }
  }, [syncPhase, showInfo, showSuccess, showError]);

  const { getActiveSubscription } = usePushSubscription();
  const [hasActivePushSubscription, setHasActivePushSubscription] = useState(false);
  useEffect(() => {
    if (settings.notifications !== "on") {
      setHasActivePushSubscription(false);
      return;
    }
    let cancelled = false;
    void getActiveSubscription().then((subscription) => {
      if (!cancelled) setHasActivePushSubscription(subscription != null);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.notifications, getActiveSubscription]);

  useShiftNotifications({
    enabled: settings.notifications === "on",
    myTeam,
    scheduleType,
    leadTimeMinutes: settings.notificationLeadTimeMinutes,
    quietHoursStart: settings.notificationQuietHoursStart,
    quietHoursEnd: settings.notificationQuietHoursEnd,
    hasActivePushSubscription,
  });

  // When the user authenticates (e.g. via SettingsPanel CTAs), mark the account sync
  // announcement as seen so the banner is suppressed and state is consistent with the session.
  useEffect(() => {
    if (isAuthenticated && accountSyncAnnouncementSeen !== true) {
      setAccountSyncAnnouncementSeen(true);
    }
  }, [isAuthenticated, accountSyncAnnouncementSeen, setAccountSyncAnnouncementSeen]);

  // Per-feature announcements: each flag drives an independent banner entry.
  // undefined = user hasn't interacted with the feature yet → show announcement.
  const featureAnnouncements = hasCompletedOnboarding
    ? [
        ...(ganttAnnouncementSeen === undefined
          ? [
              {
                name: m.feature_announcement_gantt_name(),
                detail: m.feature_announcement_gantt_detail(),
              },
            ]
          : []),
        ...(crossBorderAnnouncementSeen === undefined
          ? [
              {
                name: m.feature_announcement_cross_border_name(),
                detail: m.feature_announcement_cross_border_detail(),
              },
            ]
          : []),
        ...(accountSyncAnnouncementSeen === undefined
          ? [
              {
                name: m.feature_announcement_account_sync_name(),
                detail: m.feature_announcement_account_sync_detail(),
              },
            ]
          : []),
      ]
    : [];
  const [activeTab, setActiveTab] = useState<TabKey>(lastUsed.activeTab);
  const [showAbout, setShowAbout] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const { currentDate, setCurrentDate } = useShiftCalculation();
  const [pendingTaskEditId, setPendingTaskEditId] = useState<string | null>(null);

  const handleClearPendingTaskEdit = useCallback(() => {
    setPendingTaskEditId(null);
  }, []);

  const handleTabChange = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      updateLastActiveTab(tab);
    },
    [updateLastActiveTab],
  );

  // Show welcome wizard only on first visit (never completed onboarding).
  useEffect(() => {
    if (!hasCompletedOnboarding) {
      setTeamModalMode("onboarding");
      setShowTeamModal(true);
    }
  }, [hasCompletedOnboarding]);

  // Theme switching effect - following Bootstrap 5.3 best practices
  useEffect(() => {
    if (typeof document === "undefined") return;

    const applyTheme = () => {
      const resolvedTheme =
        settings.theme === "auto"
          ? window.matchMedia("(prefers-color-scheme: dark)").matches
            ? "dark"
            : "light"
          : settings.theme;

      document.documentElement.setAttribute("data-bs-theme", resolvedTheme);
    };

    applyTheme();

    // Watch for system preference changes when in auto mode
    if (settings.theme === "auto") {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener("change", applyTheme);
      return () => mql.removeEventListener("change", applyTheme);
    }
  }, [settings.theme]);

  const handleTeamSelect = (team: number) => {
    // Save team selection (onboarding will be completed after vacation step)
    setMyTeam(team);
    // Don't close modal yet - wizard continues to vacation allowance step
  };

  const handleScheduleSelect = (schedule: ScheduleOption) => {
    try {
      const nextScheduleConfig = getScheduleConfig(schedule);
      // Always reset team when changing schedules, regardless of team count
      // Teams in different schedules represent different rosters
      const scheduleChanged = schedule !== scheduleType;
      const teamsDisabled = nextScheduleConfig.shiftConfig.teamCount <= 1;

      if (scheduleChanged || teamsDisabled) {
        // Only show notification if user had a team selected
        if (myTeam !== null) {
          setMyTeam(null);
          // Provide appropriate message based on the reason for reset
          if (scheduleChanged) {
            showInfo(m.schedule_team_reset_changed());
          } else {
            showInfo(m.schedule_team_reset_no_teams());
          }
        }
      }
      setScheduleType(schedule);
    } catch (error) {
      logger.error("Failed to change schedule:", error);
      showError(m.schedule_change_failed());
    }
  };

  const handleChangeTeam = () => {
    setTeamModalMode("change-team");
    setShowTeamModal(true);
  };

  const handleChangeSchedule = () => {
    setTeamModalMode("change-schedule");
    setShowTeamModal(true);
  };

  const handleTeamModalHide = (payload?: WizardCompletionPayload) => {
    // Complete onboarding when wizard closes (after vacation step)
    // Use atomic update to ensure vacation allowance persists correctly
    if (teamModalMode === "onboarding" && !hasCompletedOnboarding) {
      // Ensure a schedule has been selected before completing onboarding
      if (!scheduleType) {
        showError(m.schedule_required_before_setup());
        return;
      }
      const selectedScheduleConfig = SCHEDULE_OPTIONS.find(
        (option) => option.value === scheduleType,
      );
      if (!selectedScheduleConfig) {
        // Defensive validation: Despite TypeScript guarantees that scheduleType is a valid
        // ScheduleOption, this runtime check protects against data corruption, invalid
        // localStorage state, or future refactoring issues. This prevents silently completing
        // onboarding with inconsistent schedule data.
        showError(m.selected_schedule_missing());
        return;
      }
      const requiresTeam = selectedScheduleConfig.shiftConfig.teamCount > 1;
      const teamForCompletion = requiresTeam ? myTeam : null;
      completeOnboardingWithSchedule(scheduleType, teamForCompletion, payload);
      if (teamForCompletion !== null) {
        showSuccess(m.team_selected_success({ team: teamForCompletion }), "bi-people-fill");
      }
    }
    setShowTeamModal(false);
  };

  const handleWizardDefer = () => {
    // User clicked "Maybe Later" - reset team selection and close without marking onboarding as complete
    // Wizard will show again on next visit
    setMyTeam(null);
    setShowTeamModal(false);
  };

  return (
    <OngoingSyncProvider isSyncEstablished={isSyncEstablished}>
      <PwaUpdateToast />
      <PwaInstallPrompt />
      <ErrorBoundary>
        <AppShellProvider
          value={{
            featureAnnouncements,
            dismissFeatureAnnouncements: () => {
              if (ganttAnnouncementSeen === undefined) setGanttAnnouncementSeen(false);
              if (crossBorderAnnouncementSeen === undefined) setCrossBorderAnnouncementSeen(false);
              if (accountSyncAnnouncementSeen === undefined) setAccountSyncAnnouncementSeen(false);
            },
            showAbout,
            openAbout: () => setShowAbout(true),
            closeAbout: () => setShowAbout(false),
            showShortcuts,
            openShortcuts: () => setShowShortcuts(true),
            closeShortcuts: () => setShowShortcuts(false),
            myTeam,
            currentDate,
            setCurrentDate,
            activeTab,
            onTabChange: handleTabChange,
            onChangeSchedule: handleChangeSchedule,
            onChangeTeam: handleChangeTeam,
            pendingTaskEditId,
            requestTaskEdit: setPendingTaskEditId,
            clearPendingTaskEdit: handleClearPendingTaskEdit,
            showTeamModal,
            teamModalMode,
            teamWizardStartStep:
              teamModalMode === "onboarding"
                ? "welcome"
                : teamModalMode === "change-schedule"
                  ? "schedule-selection"
                  : "team-selection",
            onTeamSelect: handleTeamSelect,
            onScheduleSelect: handleScheduleSelect,
            onSkipTeamWizard: () => setMyTeam(null),
            onHideTeamModal: handleTeamModalHide,
            onDeferTeamWizard: handleWizardDefer,
            syncConflictShow: syncPhase === "conflict",
            syncConflictCounts: syncConflictCounts,
            onResolveSyncConflict: resolveConflict,
            onDismissSyncConflict: dismissSync,
          }}
        >
          <RouterProvider router={router} />
        </AppShellProvider>
      </ErrorBoundary>
    </OngoingSyncProvider>
  );
}

/**
 * Root application component that composes context providers and renders the app content.
 *
 * @returns The root React element: OidcAuthProvider, SettingsProvider, EventStoreProvider,
 *   DeveloperOptionsProvider, ToastProvider, and AuthProvider wrapping AppContent
 */

// ---------------------------------------------------------------------------

/**
 * TanStack Query client shared by the whole app.
 *
 * Standalone `useQuery` is only correct for read-only server-state domains that have no
 * offline write requirements (e.g. public holidays via useOpenHolidays).
 *
 * Sync-managed domains (labels, tasks, templates, work locations, time-off entries,
 * gantt tasks) use QueryCollection from @tanstack/query-db-collection,
 * which feeds TanStack Query's fetch lifecycle into a TanStack DB collection. Do NOT add
 * a standalone useQuery alongside a QueryCollection for the same domain.
 */

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <OidcAuthProvider {...oidcConfig}>
        <SettingsProvider>
          <EventStoreProvider>
            <DeveloperOptionsProvider>
              <ToastProvider>
                <PwaInstallProvider>
                  <AuthProvider>
                    <AppContent />
                  </AuthProvider>
                </PwaInstallProvider>
              </ToastProvider>
            </DeveloperOptionsProvider>
          </EventStoreProvider>
        </SettingsProvider>
      </OidcAuthProvider>
    </QueryClientProvider>
  );
}

export default App;

