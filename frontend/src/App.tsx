import { useCallback, useEffect, useState } from "react";
import Container from "react-bootstrap/Container";
import { SuperTokensWrapper } from "supertokens-auth-react";
import { AboutModal } from "./components/AboutModal";
import { CurrentStatus } from "./components/CurrentStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { MainTabs } from "./components/MainTabs";
import { FeatureIntroAlert } from "./components/FeatureIntroAlert";
import { WelcomeWizard, type WizardCompletionPayload } from "./components/WelcomeWizard";
import { AuthProvider } from "./contexts/AuthContext";
import { EventStoreProvider } from "./contexts/EventStoreContext";
import {
  SettingsProvider,
  type TabKey,
  USER_STATE_VERSION,
  useSettings,
} from "./contexts/SettingsContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { DeveloperOptionsProvider } from "./contexts/DeveloperOptionsContext";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "./data/rosters";
import { useShiftCalculation } from "./hooks/useShiftCalculation";
import { getScheduleConfig } from "./utils/scheduleUtils";
import { validateVacationAllowance } from "./utils/vacationCalculations";

// Features added in each schema version. Shown as an inline alert to users who haven't seen them.
const FEATURE_ANNOUNCEMENTS: { version: number; name: string; detail: string }[] = [
  {
    version: 5,
    name: "Account Sync",
    detail: "Connect an account to back up your data and access it from any device",
  },
  {
    version: 4,
    name: "Personal Gantt Chart",
    detail: "Visualize and track project tasks on a timeline",
  },
  {
    version: 3,
    name: "Cross-Border Tracking",
    detail: "Log your daily work location for tax reporting",
  },
];

/**
 * The main application component for team selection and shift management.
 *
 * Coordinates team selection, loading state, and tab navigation, and renders the primary UI for viewing and managing shift information.
 *
 * @returns The application's rendered user interface.
 */
function AppContent() {
  const { showSuccess, showInfo, showError } = useToast();
  const {
    myTeam,
    setMyTeam,
    hasCompletedOnboarding,
    lastOnboardedVersion,
    completeOnboardingWithSchedule,
    completeFeatureIntro,
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

  // Features the user hasn't been shown yet — drives the inline announcement banner.
  const newFeatures = hasCompletedOnboarding
    ? FEATURE_ANNOUNCEMENTS.filter((f) => f.version > lastOnboardedVersion)
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
    <ErrorBoundary>
      <div className="min-vh-100">
        <Container fluid>
          <Header
            onShowAbout={() => setShowAbout(true)}
            onChangeSchedule={handleChangeSchedule}
            onChangeTeam={handleChangeTeam}
          />
          {newFeatures.length > 0 && (
            <FeatureIntroAlert
              features={newFeatures}
              onDismiss={() => completeFeatureIntro(USER_STATE_VERSION)}
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
          <AboutModal show={showAbout} onHide={() => setShowAbout(false)} />
        </Container>
      </div>
    </ErrorBoundary>
  );
}

/**
 * Root application component that composes context providers and renders the app content.
 *
 * @returns The root React element: SuperTokensWrapper, SettingsProvider, EventStoreProvider,
 *   DeveloperOptionsProvider, ToastProvider, and AuthProvider wrapping AppContent
 */
function App() {
  return (
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
  );
}

export default App;
