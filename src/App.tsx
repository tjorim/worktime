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
import { useShiftCalculation } from "./hooks/useShiftCalculation";
import { CONFIG } from "./utils/config";
import { dayjs } from "./utils/dateTimeUtils";
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
  const [teamModalMode, setTeamModalMode] = useState<"onboarding" | "change-team">("onboarding");
  const [activeTab, setActiveTab] = useState("today");
  const [showAbout, setShowAbout] = useState(false);
  const { showSuccess, showInfo } = useToast();
  const {
    myTeam,
    setMyTeam,
    hasCompletedOnboarding,
    completeOnboardingWithVacation,
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
      const teamNumber = parseInt(team, 10);
      if (teamNumber >= 1 && teamNumber <= CONFIG.TEAMS_COUNT) {
        setMyTeam(teamNumber);
      }
    }

    if (date) {
      const parsedDate = dayjs(date);
      if (parsedDate.isValid()) {
        setCurrentDate(parsedDate);
      }
    }

    pendingDeepLinkRef.current = {};
  }, [hasCompletedOnboarding, setMyTeam, setCurrentDate]);

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

  const handleChangeTeam = () => {
    setTeamModalMode("change-team");
    setShowTeamModal(true);
  };

  const handleTeamModalHide = (vacationAllowance?: {
    amount: number;
    unit: VacationAllowanceUnit;
  }) => {
    // Complete onboarding when wizard closes (after vacation step)
    // Use atomic update to ensure vacation allowance persists correctly
    if (teamModalMode === "onboarding" && !hasCompletedOnboarding) {
      completeOnboardingWithVacation(myTeam, vacationAllowance);
      if (myTeam !== null) {
        showSuccess(`Team ${myTeam} selected! Your shifts are now personalized.`, "🎯");
      }
    } else if (teamModalMode === "change-team" && vacationAllowance) {
      // Persist vacation allowance changes in change-team mode
      updateVacationAllowance(vacationAllowance);
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
          <Header onShowAbout={() => setShowAbout(true)} />
          <ErrorBoundary>
            <CurrentStatus
              myTeam={myTeam}
              onChangeTeam={handleChangeTeam}
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
            onSkip={() => {
              // User chose to browse all teams - clear team selection
              setMyTeam(null);
              // Continue to vacation step, don't close modal yet
            }}
            onHide={handleTeamModalHide}
            onDefer={handleWizardDefer}
            startStep={teamModalMode === "onboarding" ? "welcome" : "team-selection"}
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
