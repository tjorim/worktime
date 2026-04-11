import { useCallback, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Container from "react-bootstrap/Container";
import { SuperTokensWrapper } from "supertokens-auth-react";
import { AboutModal } from "./components/AboutModal";
import { CurrentStatus } from "./components/CurrentStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { MainTabs } from "./components/MainTabs";
import { FeatureIntroAlert } from "./components/FeatureIntroAlert";
import { FirstSyncConflictDialog } from "./components/FirstSyncConflictDialog";
import { OngoingConflictDialog } from "./components/sync/OngoingConflictDialog";
import { WelcomeWizard, type WizardCompletionPayload } from "./components/WelcomeWizard";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { EventStoreProvider } from "./contexts/EventStoreContext";
import { OngoingSyncProvider, useOngoingSyncContext } from "./contexts/OngoingSyncContext";
import { SettingsProvider, type TabKey, useSettings } from "./contexts/SettingsContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { DeveloperOptionsProvider } from "./contexts/DeveloperOptionsContext";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "./data/rosters";
import { useShiftCalculation } from "./hooks/useShiftCalculation";
import { useApiClient } from "./hooks/useApiClient";
import { useFirstSyncFlow } from "./hooks/useFirstSyncFlow";
import { getScheduleConfig } from "./utils/scheduleUtils";
import { validateVacationAllowance } from "./utils/vacationCalculations";
import * as m from "./paraglide/messages.js";

/**
 * Inner component that consumes OngoingSyncContext to render the conflict
 * resolution dialog.  Must be rendered inside <OngoingSyncProvider>.
 */
function OngoingConflictHandler() {
  const { conflictCount, conflictedPayload, resolveOngoingConflicts } = useOngoingSyncContext();

  return (
    <OngoingConflictDialog
      show={conflictCount > 0}
      conflictCount={conflictCount}
      conflictedPayload={conflictedPayload}
      onResolve={resolveOngoingConflicts}
    />
  );
}

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
    updateVacationAllowance,
    updateLastActiveTab,
    settings,
    lastUsed,
  } = useSettings();
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
  const { currentDate, setCurrentDate } = useShiftCalculation();

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
            showInfo(
              "Your team selection has been reset because you changed schedules. Please select your team again.",
            );
          } else {
            showInfo(
              "Your team selection has been reset because the selected schedule does not use team assignments.",
            );
          }
        }
      }
      setScheduleType(schedule);
    } catch (error) {
      console.error("Failed to change schedule:", error);
      showError("Failed to change schedule. Please try again.");
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
        showError("Please select a schedule before completing setup.");
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
        showError(
          "An internal configuration error occurred: the selected schedule could not be found. Please try again or contact support.",
        );
        return;
      }
      const requiresTeam = selectedScheduleConfig.shiftConfig.teamCount > 1;
      const teamForCompletion = requiresTeam ? myTeam : null;
      completeOnboardingWithSchedule(scheduleType, teamForCompletion, payload);
      if (teamForCompletion !== null) {
        showSuccess(
          `Team ${teamForCompletion} selected! Your shifts are now personalized.`,
          "bi-people-fill",
        );
      }
    } else if (
      (teamModalMode === "change-team" || teamModalMode === "change-schedule") &&
      payload?.vacationAllowance
    ) {
      const result = validateVacationAllowance(payload.vacationAllowance);
      if (result.valid) {
        updateVacationAllowance(payload.vacationAllowance);
        showSuccess("Vacation allowance updated successfully.");
      } else {
        showError(`Vacation allowance update failed: ${result.errors.join(", ")}`);
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
      <ErrorBoundary>
        <div className="min-vh-100">
          <Container fluid>
            <Header
              onShowAbout={() => setShowAbout(true)}
              onChangeSchedule={handleChangeSchedule}
              onChangeTeam={handleChangeTeam}
            />
            {featureAnnouncements.length > 0 && (
              <FeatureIntroAlert
                features={featureAnnouncements}
                onDismiss={() => {
                  if (ganttAnnouncementSeen === undefined) setGanttAnnouncementSeen(false);
                  if (crossBorderAnnouncementSeen === undefined)
                    setCrossBorderAnnouncementSeen(false);
                  if (accountSyncAnnouncementSeen === undefined)
                    setAccountSyncAnnouncementSeen(false);
                }}
              />
            )}
            <ErrorBoundary>
              <CurrentStatus
                myTeam={myTeam}
                onChangeTeam={handleChangeTeam}
                onChangeSchedule={handleChangeSchedule}
              />
            </ErrorBoundary>
            <ErrorBoundary>
              <MainTabs
                myTeam={myTeam}
                currentDate={currentDate}
                setCurrentDate={setCurrentDate}
                activeTab={activeTab}
                onTabChange={handleTabChange}
                onChangeSchedule={handleChangeSchedule}
                onChangeTeam={handleChangeTeam}
              />
            </ErrorBoundary>
            <WelcomeWizard
              show={showTeamModal}
              onTeamSelect={handleTeamSelect}
              onScheduleSelect={handleScheduleSelect}
              onSkip={() => {
                // User chose to browse all teams - clear team selection
                setMyTeam(null);
                // Continue to vacation step, don't close modal yet
              }}
              onHide={handleTeamModalHide}
              onDefer={handleWizardDefer}
              mode={teamModalMode}
              startStep={
                teamModalMode === "onboarding"
                  ? "welcome"
                  : teamModalMode === "change-schedule"
                    ? "schedule-selection"
                    : "team-selection"
              }
            />
            <FirstSyncConflictDialog
              show={syncPhase === "conflict"}
              onResolve={resolveConflict}
              onDismiss={dismissSync}
            />
            <OngoingConflictHandler />
            <AboutModal show={showAbout} onHide={() => setShowAbout(false)} />
          </Container>
        </div>
      </ErrorBoundary>
    </OngoingSyncProvider>
  );
}

/**
 * Root application component that composes context providers and renders the app content.
 *
 * @returns The root React element: SuperTokensWrapper, SettingsProvider, EventStoreProvider,
 *   DeveloperOptionsProvider, ToastProvider, and AuthProvider wrapping AppContent
 */
const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuperTokensWrapper>
        <SettingsProvider>
          <EventStoreProvider>
            <DeveloperOptionsProvider>
              <ToastProvider>
                <AuthProvider>
                  <AppContent />
                </AuthProvider>
              </ToastProvider>
            </DeveloperOptionsProvider>
          </EventStoreProvider>
        </SettingsProvider>
      </SuperTokensWrapper>
    </QueryClientProvider>
  );
}

export default App;
