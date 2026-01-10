import { useEffect, useRef, useState } from "react";
import Container from "react-bootstrap/Container";
import { AboutModal } from "./components/AboutModal";
import { CurrentStatus } from "./components/CurrentStatus";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Header } from "./components/Header";
import { MainTabs } from "./components/MainTabs";
import { WelcomeWizard } from "./components/WelcomeWizard";
import { EventStoreProvider } from "./contexts/EventStoreContext";
import { SettingsProvider, useSettings } from "./contexts/SettingsContext";
import { ToastProvider, useToast } from "./contexts/ToastContext";
import { SCHEDULE_OPTIONS, type ScheduleOption } from "./data/rosters";
import { useShiftCalculation } from "./hooks/useShiftCalculation";
import { dayjs } from "./utils/dateTimeUtils";
import { getScheduleConfig, getTeamCountForOption } from "./utils/scheduleUtils";
import type { VacationAllowanceUnit } from "./utils/vacationCalculations";

/**
 * The main application component for team selection and shift management.
 *
 * Coordinates team selection, loading state, and tab navigation, and renders the primary UI for viewing and managing shift information.
 *
 * @returns The application's rendered user interface.
 */
function AppContent() {
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [teamModalMode, setTeamModalMode] = useState<
    "onboarding" | "change-team" | "change-schedule"
  >("onboarding");
  const [activeTab, setActiveTab] = useState("today");
  const [showAbout, setShowAbout] = useState(false);
  const { showSuccess, showInfo, showError } = useToast();
  const {
    myTeam,
    setMyTeam,
    hasCompletedOnboarding,
    completeOnboardingWithSchedule,
    scheduleType,
    setScheduleType,
    updateVacationAllowance,
    settings,
  } = useSettings();
  const { currentDate, setCurrentDate, todayShifts } = useShiftCalculation();
  const pendingDeepLinkRef = useRef<{ team?: string; date?: string }>({});

  // Handle URL parameters for deep linking
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get("tab");
    const teamParam = urlParams.get("team");
    const dateParam = urlParams.get("date");

    // Set active tab from URL
    if (tabParam && ["today", "schedule", "transfer", "timeoff"].includes(tabParam)) {
      setActiveTab(tabParam);
    }

    if (teamParam) {
      pendingDeepLinkRef.current.team = teamParam;
    }

    if (dateParam) {
      pendingDeepLinkRef.current.date = dateParam;
    }

    // Clear URL parameters after processing to keep URL clean
    if (urlParams.toString()) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!hasCompletedOnboarding) return;

    const { team, date } = pendingDeepLinkRef.current;

    if (team) {
      try {
        const teamNumber = parseInt(team, 10);
        const teamCount = getTeamCountForOption(scheduleType);
        if (teamNumber >= 1 && teamNumber <= teamCount) {
          setMyTeam(teamNumber);
        }
      } catch (error) {
        console.error("Failed to process deep-link team parameter:", error);
      }
    }

    if (date) {
      try {
        const parsedDate = dayjs(date);
        if (parsedDate.isValid()) {
          setCurrentDate(parsedDate);
        }
      } catch (error) {
        console.error("Failed to process deep-link date parameter:", error);
      }
    }

    pendingDeepLinkRef.current = {};
  }, [hasCompletedOnboarding, setMyTeam, setCurrentDate, scheduleType]);

  // Show welcome wizard only on first visit (never completed onboarding)
  useEffect(() => {
    if (!hasCompletedOnboarding) {
      setTeamModalMode("onboarding");
      setShowTeamModal(true);
    }
  }, [hasCompletedOnboarding]); // Run whenever onboarding completion changes

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
      const teamsDisabled = !(nextScheduleConfig.showsTeamSelection ?? true);

      if (scheduleChanged || teamsDisabled) {
        // Only show notification if user had a team selected
        if (myTeam !== null) {
          setMyTeam(null);
          // Provide appropriate message based on the reason for reset
          if (scheduleChanged) {
            showInfo(
              "Your team selection has been reset because you changed schedules. Please select your team again.",
              "ℹ️",
            );
          } else {
            showInfo(
              "Your team selection has been reset because the selected schedule does not use team assignments.",
              "ℹ️",
            );
          }
        }
      }
      setScheduleType(schedule);
    } catch (error) {
      console.error("Failed to change schedule:", error);
      showError("Failed to change schedule. Please try again.", "❌");
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

  const handleTeamModalHide = (vacationAllowance?: {
    amount: number;
    unit: VacationAllowanceUnit;
  }) => {
    // Complete onboarding when wizard closes (after vacation step)
    // Use atomic update to ensure vacation allowance persists correctly
    if (teamModalMode === "onboarding" && !hasCompletedOnboarding) {
      // Ensure a schedule has been selected before completing onboarding
      if (!scheduleType) {
        showError("Please select a schedule before completing setup.", "⚠️");
        return;
      }
      const selectedScheduleConfig = SCHEDULE_OPTIONS.find(
        (option) => option.value === scheduleType
      );
      if (!selectedScheduleConfig) {
        // Fail fast if the selected schedule type does not match any known configuration.
        // This prevents silently completing onboarding with inconsistent schedule data.
        showError(
          "An internal configuration error occurred: the selected schedule could not be found. Please try again or contact support.",
          "⚠️"
        );
        return;
      }
      const requiresTeam = selectedScheduleConfig.showsTeamSelection;
      const teamForCompletion = requiresTeam ? myTeam : null;
      completeOnboardingWithSchedule(scheduleType, teamForCompletion, vacationAllowance);
      if (teamForCompletion !== null) {
        showSuccess(`Team ${teamForCompletion} selected! Your shifts are now personalized.`, "🎯");
      }
    } else if (teamModalMode === "change-team" && vacationAllowance) {
      // Persist vacation allowance changes in change-team mode
      updateVacationAllowance(vacationAllowance);
      showSuccess("Vacation allowance updated successfully.", "✅");
    }
    setShowTeamModal(false);
  };

  const handleWizardDefer = () => {
    // User clicked "Maybe Later" - reset team selection and close without marking onboarding as complete
    // Wizard will show again on next visit
    setMyTeam(null);
    setShowTeamModal(false);
  };

  const handleShowWhoIsWorking = () => {
    // Switch to Today tab to show who's working
    setActiveTab("today");
    setCurrentDate(dayjs());
    showInfo("Switched to Today view to see who's working", "👥");
  };

  return (
    <ErrorBoundary>
      <div className="min-vh-100">
        <Container fluid>
          <Header onShowAbout={() => setShowAbout(true)} onChangeSchedule={handleChangeSchedule} />
          <ErrorBoundary>
            <CurrentStatus
              myTeam={myTeam}
              onChangeTeam={handleChangeTeam}
              onChangeSchedule={handleChangeSchedule}
              onShowWhoIsWorking={handleShowWhoIsWorking}
            />
          </ErrorBoundary>
          <ErrorBoundary>
            <MainTabs
              myTeam={myTeam}
              currentDate={currentDate}
              setCurrentDate={setCurrentDate}
              todayShifts={todayShifts}
              activeTab={activeTab}
              onTabChange={setActiveTab}
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
 * @returns The root React element: SettingsProvider, EventStoreProvider and ToastProvider wrapping AppContent
 */
function App() {
  return (
    <SettingsProvider>
      <EventStoreProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </EventStoreProvider>
    </SettingsProvider>
  );
}

export default App;
