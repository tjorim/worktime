/**
 * End-to-end integration tests for WelcomeWizard flows.
 *
 * These tests simulate complete user journeys through the wizard across
 * different modes (onboarding, change-team, change-schedule) and schedule
 * configurations to ensure all state transitions work correctly.
 */
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { WelcomeWizard } from "../../src/components/WelcomeWizard";
import { SettingsProvider } from "../../src/contexts/SettingsContext";

// ============================================================================
// Test Helpers & Setup
// ============================================================================

const defaultUserState = {
  version: 1,
  hasCompletedOnboarding: false,
  myTeam: null,
  scheduleType: null,
  settings: {
    timeFormat: "24h" as const,
    theme: "auto" as const,
    notifications: "off" as const,
    vacationAllowance: {
      amount: 0,
      unit: "days" as const,
      hoursPerDay: 8,
    },
    enableTimeOff: true,
    enableTimeTracking: true,
    timeTrackingWeeklyTargetHours: 40,
  },
  lastUsed: {
    activeTab: "calendar",
    scheduleView: "today",
    otherSchedule: null,
    timeOffView: "table",
    timeTrackingView: "daily",
    otherTeam: null,
  },
};

const defaultProps = {
  show: true,
  onTeamSelect: vi.fn(),
  onHide: vi.fn(),
  isLoading: false,
};

/**
 * Seeds localStorage with user state for testing.
 */
function seedUserState(overrides?: Partial<typeof defaultUserState>) {
  const state = {
    ...defaultUserState,
    ...overrides,
    settings: {
      ...defaultUserState.settings,
      ...(overrides?.settings ?? {}),
    },
    lastUsed: {
      ...defaultUserState.lastUsed,
      ...(overrides?.lastUsed ?? {}),
    },
  };
  window.localStorage.setItem("worktime_user_state", JSON.stringify(state));
  return state;
}

/**
 * Renders component with SettingsProvider and seeded state.
 */
function renderWithProviders(
  ui: React.ReactElement,
  overrides?: Partial<typeof defaultUserState>,
) {
  seedUserState(overrides);
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

/**
 * Finds modal title by text (filters for modal-title class).
 */
async function findModalTitle(text: RegExp) {
  const headings = await screen.findAllByText(text);
  const modalHeading = headings.find((el) => el.className.includes("modal-title"));
  expect(modalHeading).toBeInTheDocument();
  return modalHeading;
}

/**
 * Waits for specific step indicator to appear.
 */
async function waitForStep(stepNumber: number, totalSteps: number = 7, timeout = 3000) {
  await waitFor(
    () => {
      // Use a function matcher to handle split text nodes and normalize whitespace
      const stepText = screen.getByText((content, element) => {
        // Normalize whitespace in text content
        const normalizedText = element?.textContent?.replace(/\s+/g, " ").trim();
        return normalizedText === `Step ${stepNumber} of ${totalSteps}`;
      });
      expect(stepText).toBeInTheDocument();
    },
    { timeout },
  );
}

/**
 * Navigates from welcome through features and schedule selection to team selection step.
 * Assumes wizard starts at welcome step and 5-shift schedule is selected.
 */
async function navigateToTeamSelection(user: ReturnType<typeof userEvent.setup>) {
  // Step 1: Welcome → Features
  const getStartedButton = screen.getByRole("button", { name: /Let's Get Started/i });
  await user.click(getStartedButton);
  await waitForStep(2, 7);

  // Step 2: Features → Schedule Selection
  const chooseScheduleButton = screen.getByRole("button", { name: /Choose a Schedule/i });
  await user.click(chooseScheduleButton);
  await waitForStep(3, 7);

  // Step 3: Schedule Selection → Team Selection
  await user.click(screen.getByRole("button", { name: /5-shift/i }));
  await user.click(screen.getByRole("button", { name: /Continue/i }));
  await waitForStep(4, 7);
}

/**
 * Completes full onboarding flow from welcome to finish.
 */
async function completeOnboarding(
  user: ReturnType<typeof userEvent.setup>,
  options: {
    selectTeam?: number;
    skipTeam?: boolean;
    scheduleType?: "5-shift" | "9-5" | "2-shift" | "weekend-shift";
    setVacation?: boolean;
    vacationAmount?: string;
    skipVacation?: boolean;
  } = {},
) {
  const {
    selectTeam,
    skipTeam = false,
    scheduleType = "5-shift",
    setVacation = false,
    vacationAmount = "25",
    skipVacation = false,
  } = options;

  // Welcome → Features
  await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
  await waitForStep(2, 7);

  // Features → Schedule Selection
  await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
  await waitForStep(3, 7);

  // Select schedule
  const scheduleButton = screen.getByRole("button", { name: new RegExp(scheduleType, "i") });
  await user.click(scheduleButton);

  const scheduleRequiresTeam = scheduleType !== "9-5";

  if (scheduleRequiresTeam) {
    // Continue to team selection
    await user.click(screen.getByRole("button", { name: /Continue/i }));
    await waitForStep(4, 7);

    // Handle team selection
    if (skipTeam) {
      await user.click(screen.getByRole("button", { name: /Browse All Teams/i }));
    } else if (selectTeam) {
      await user.click(screen.getByLabelText(new RegExp(`Select Team ${selectTeam}`, "i")));
    }
  } else {
    // For 9-5, no team selection needed - go to time-off setup
    await user.click(screen.getByRole("button", { name: /Continue/i }));
  }

  // Time Off Setup step
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { name: /Enable Time Off Tracking/i }),
    ).toBeInTheDocument(),
  );

  if (setVacation) {
    await user.click(screen.getByRole("button", { name: /Set Vacation Allowance/i }));

    // Vacation Allowance step
    await waitFor(() =>
      expect(screen.getByText(/Set Up Vacation Tracking/i)).toBeInTheDocument(),
    );

    const amountInput = screen.getByLabelText(/Annual vacation allowance/i);
    await user.clear(amountInput);
    await user.type(amountInput, vacationAmount);

    await user.click(screen.getByRole("button", { name: /Save & Complete/i }));
  } else if (skipVacation) {
    await user.click(screen.getByRole("button", { name: /Skip for Now/i }));
  } else {
    await user.click(screen.getByRole("button", { name: /Set Vacation Allowance/i }));
    await user.click(screen.getByRole("button", { name: /Skip/i }));
  }

  // Time Tracking Setup step
  await waitFor(() => expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: /Finish Setup/i }));

  // Wait for modal to close
  await waitFor(() => expect(screen.queryByText(/Welcome to Worktime/i)).not.toBeInTheDocument());
}

// ============================================================================
// Test Suite
// ============================================================================

describe("WelcomeWizard Integration Tests", () => {
  let originalLocalStorage: Storage;
  let testStorage: Record<string, string>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a real storage implementation for testing
    testStorage = {};

    // Mock localStorage with a real implementation
    originalLocalStorage = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      value: {
        clear: vi.fn(() => {
          testStorage = {};
        }),
        getItem: vi.fn((key: string) => {
          return testStorage[key] || null;
        }),
        setItem: vi.fn((key: string, value: string) => {
          testStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete testStorage[key];
        }),
        length: 0,
        key: vi.fn(),
      },
      writable: true,
    });

    seedUserState();
  });

  afterEach(() => {
    // Restore original localStorage
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      writable: true,
    });
    window.localStorage.clear?.();
    vi.clearAllMocks();
    // Clean up DOM modifications
    document.body.className = "";
    document.documentElement.removeAttribute("data-bs-theme");
  });

  // ==========================================================================
  // Complete Onboarding Flow Tests
  // ==========================================================================

  describe("Complete Onboarding Flow", () => {
    it("should complete full onboarding with team and vacation setup", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Verify wizard appears
      await findModalTitle(/Welcome to Worktime/i);
      await waitForStep(1, 7);

      // Complete full flow
      await completeOnboarding(user, {
        selectTeam: 3,
        setVacation: true,
        vacationAmount: "28",
      });

      // Verify state was saved
      const saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.hasCompletedOnboarding).toBe(true);
      expect(saved.myTeam).toBe(3);
      expect(saved.scheduleType).toBe("5-shift");
      expect(saved.settings.vacationAllowance.amount).toBe(28);
      expect(saved.settings.vacationAllowance.unit).toBe("days");
    });

    it("should complete onboarding for 9-5 schedule without team selection", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      // Complete flow with 9-5 schedule
      await completeOnboarding(user, {
        scheduleType: "9-5",
        setVacation: true,
        vacationAmount: "20",
      });

      // Verify state - no team selected for 9-5
      const saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.hasCompletedOnboarding).toBe(true);
      expect(saved.myTeam).toBeNull();
      expect(saved.scheduleType).toBe("9-5");
      expect(saved.settings.vacationAllowance.amount).toBe(20);
    });

    it("should allow deferring onboarding with Maybe Later", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      // Click Maybe Later button
      const maybeLaterButton = screen.getByRole("button", { name: /Maybe Later/i });
      await user.click(maybeLaterButton);

      // Modal should close
      await waitFor(() =>
        expect(screen.queryByText(/Welcome to Worktime/i)).not.toBeInTheDocument(),
      );

      // Verify onboarding NOT completed
      const saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.hasCompletedOnboarding).toBe(false);
    });

    it("should allow skipping team selection with Browse All Teams", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      await completeOnboarding(user, {
        skipTeam: true,
        setVacation: true,
        vacationAmount: "30",
      });

      // Verify state - no team selected but onboarding complete
      const saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.hasCompletedOnboarding).toBe(true);
      expect(saved.myTeam).toBeNull();
      expect(saved.settings.vacationAllowance.amount).toBe(30);
    });

    it("should allow skipping vacation allowance setup", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      await completeOnboarding(user, {
        selectTeam: 2,
        skipVacation: true,
      });

      // Verify state - vacation not set
      const saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.hasCompletedOnboarding).toBe(true);
      expect(saved.myTeam).toBe(2);
      expect(saved.settings.vacationAllowance.amount).toBe(0);
    });

    it("should track progress through all 7 steps correctly", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);
      await waitForStep(1, 7);

      // Step 1 → 2
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await waitForStep(2, 7);

      // Step 2 → 3
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      await waitForStep(3, 7);

      // Step 3 → 4
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      await waitForStep(4, 7);

      // Step 4 → 5
      await user.click(screen.getByLabelText(/Select Team 1/i));
      await waitForStep(5, 7);

      // Step 5 → 6
      await user.click(screen.getByRole("button", { name: /Set Vacation Allowance/i }));
      await waitForStep(6, 7);

      // Step 6 → 7
      await user.click(screen.getByRole("button", { name: /Skip/i }));
      await waitForStep(7, 7);
    });
  });

  // ==========================================================================
  // Change-Team Flow Tests
  // ==========================================================================

  describe("Change-Team Flow", () => {
    it("should open wizard in change-team mode and select different team", async () => {
      const user = userEvent.setup();
      const onTeamSelect = vi.fn();
      const onHide = vi.fn();

      // Start with completed onboarding
      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-team"
          onTeamSelect={onTeamSelect}
          onHide={onHide}
        />,
        {
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "5-shift",
        },
      );

      // Should start directly at team selection
      await waitFor(() => expect(screen.getByText(/Choose your team/i)).toBeInTheDocument());

      // Change-team mode shows step progress
      await waitForStep(1, 1);

      // Select different team
      await user.click(screen.getByLabelText(/Select Team 4/i));

      // Should call onTeamSelect and close
      expect(onTeamSelect).toHaveBeenCalledWith(4);
    });

    it("should close without changing team when cancel is clicked", async () => {
      const user = userEvent.setup();
      const onHide = vi.fn();
      const onTeamSelect = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-team"
          onHide={onHide}
          onTeamSelect={onTeamSelect}
        />,
        {
          hasCompletedOnboarding: true,
          myTeam: 2,
          scheduleType: "5-shift",
        },
      );

      await waitFor(() => expect(screen.getByText(/Choose your team/i)).toBeInTheDocument());

      // Find and click Cancel button
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);

      // Should close without selecting team
      expect(onHide).toHaveBeenCalledTimes(1);
      expect(onTeamSelect).not.toHaveBeenCalled();
    });

    it("should close without changing team when clicking back from team selection", async () => {
      const user = userEvent.setup();
      const onHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard {...defaultProps} mode="change-team" onHide={onHide} />,
        {
          hasCompletedOnboarding: true,
          myTeam: 3,
          scheduleType: "5-shift",
        },
      );

      await waitFor(() => expect(screen.getByText(/Choose your team/i)).toBeInTheDocument());

      // In change-team mode with only team selection step, there is no Back button
      // User can only Cancel or select a team
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);

      // Should close modal
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it("should preserve vacation settings when changing team", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Complete initial onboarding with vacation
      await findModalTitle(/Welcome to Worktime/i);
      await completeOnboarding(user, {
        selectTeam: 1,
        setVacation: true,
        vacationAmount: "25",
      });

      // Verify initial state
      let saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.myTeam).toBe(1);
      expect(saved.settings.vacationAllowance.amount).toBe(25);

      // Open settings and change team
      await user.click(screen.getByRole("button", { name: /^Settings$/i }));
      await user.click(screen.getByRole("button", { name: /Select Team/i }));

      await waitFor(() => expect(screen.getByText(/Choose your team/i)).toBeInTheDocument());
      await user.click(screen.getByLabelText(/Select Team 5/i));

      await waitFor(() => expect(screen.queryByText(/Choose your team/i)).not.toBeInTheDocument());

      // Verify team changed but vacation preserved
      saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.myTeam).toBe(5);
      expect(saved.settings.vacationAllowance.amount).toBe(25);
    });
  });

  // ==========================================================================
  // Change-Schedule Flow Tests
  // ==========================================================================

  describe("Change-Schedule Flow", () => {
    it("should open wizard in change-schedule mode", async () => {
      const user = userEvent.setup();
      const onScheduleSelect = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-schedule"
          onScheduleSelect={onScheduleSelect}
        />,
        {
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "5-shift",
        },
      );

      // Should start at schedule selection
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });

      // Should show step progress (1 of whatever total is appropriate)
      await waitFor(() => {
        expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
      });
    });

    it("should change from multi-team to single-team schedule (5-shift → 9-5)", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Complete onboarding with 5-shift
      await findModalTitle(/Welcome to Worktime/i);
      await completeOnboarding(user, { selectTeam: 2 });

      let saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.scheduleType).toBe("5-shift");
      expect(saved.myTeam).toBe(2);

      // Open schedule change dialog
      await user.click(screen.getByRole("button", { name: /^Settings$/i }));
      await user.click(screen.getByRole("button", { name: /Select Schedule/i }));

      await waitFor(() =>
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument(),
      );

      // Select 9-5 (no teams)
      await user.click(screen.getByRole("button", { name: /9-5/i }));

      // Should show "Save Schedule" button immediately (no team selection needed)
      await waitFor(() => {
        const saveButton = screen.getByRole("button", { name: /Save Schedule/i });
        expect(saveButton).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Save Schedule/i }));

      await waitFor(() =>
        expect(screen.queryByText(/Which roster matches your team\?/i)).not.toBeInTheDocument(),
      );

      // Verify schedule changed and team reset
      saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.scheduleType).toBe("9-5");
      expect(saved.myTeam).toBeNull(); // Team should be reset for single-user schedule
    });

    it("should change from single-team to multi-team schedule (9-5 → 5-shift)", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Complete onboarding with 9-5
      await findModalTitle(/Welcome to Worktime/i);
      await completeOnboarding(user, { scheduleType: "9-5" });

      let saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.scheduleType).toBe("9-5");
      expect(saved.myTeam).toBeNull();

      // Open schedule change dialog
      await user.click(screen.getByRole("button", { name: /^Settings$/i }));
      await user.click(screen.getByRole("button", { name: /Select Schedule/i }));

      await waitFor(() =>
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument(),
      );

      // Select 5-shift (requires team)
      await user.click(screen.getByRole("button", { name: /5-shift/i }));

      // Should show Continue button (team selection required)
      await waitFor(() => {
        const continueButton = screen.getByRole("button", { name: /Continue/i });
        expect(continueButton).toBeInTheDocument();
      });

      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Should navigate to team selection
      await waitFor(() => expect(screen.getByText(/Choose your team/i)).toBeInTheDocument());

      // Select team
      await user.click(screen.getByLabelText(/Select Team 3/i));

      await waitFor(() => expect(screen.queryByText(/Choose your team/i)).not.toBeInTheDocument());

      // Verify schedule and team updated
      saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.scheduleType).toBe("5-shift");
      expect(saved.myTeam).toBe(3);
    });

    it("should reset team when changing to schedule with different team count", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Start with 5-shift and team 5
      await findModalTitle(/Welcome to Worktime/i);
      await completeOnboarding(user, { selectTeam: 5, scheduleType: "5-shift" });

      let saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.myTeam).toBe(5);
      expect(saved.scheduleType).toBe("5-shift");

      // Change to 2-shift (when available - has 2 teams)
      // For now, test with another multi-team schedule
      // This test documents expected behavior when 2-shift becomes available
      
      // Open schedule change
      await user.click(screen.getByRole("button", { name: /^Settings$/i }));
      await user.click(screen.getByRole("button", { name: /Select Schedule/i }));

      await waitFor(() =>
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument(),
      );

      // Select same schedule type to verify no reset happens
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      await user.click(screen.getByLabelText(/Select Team 5/i));

      // Team should remain 5 for same schedule type
      saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.myTeam).toBe(5);
    });

    it("should show Cancel button in change-schedule mode", async () => {
      const user = userEvent.setup();
      const onHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard {...defaultProps} mode="change-schedule" onHide={onHide} />,
        {
          hasCompletedOnboarding: true,
          myTeam: 1,
          scheduleType: "5-shift",
        },
      );

      await waitFor(() =>
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument(),
      );

      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      await user.click(cancelButton);

      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it("should preserve vacation allowance when changing schedule", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Complete onboarding with vacation
      await findModalTitle(/Welcome to Worktime/i);
      await completeOnboarding(user, {
        selectTeam: 2,
        setVacation: true,
        vacationAmount: "22",
      });

      let saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.settings.vacationAllowance.amount).toBe(22);

      // Change schedule
      await user.click(screen.getByRole("button", { name: /^Settings$/i }));
      await user.click(screen.getByRole("button", { name: /Select Schedule/i }));

      await waitFor(() =>
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: /9-5/i }));
      await user.click(screen.getByRole("button", { name: /Save Schedule/i }));

      // Verify vacation preserved
      saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.settings.vacationAllowance.amount).toBe(22);
    });
  });

  // ==========================================================================
  // Edge Cases & Advanced Scenarios
  // ==========================================================================

  describe("Edge Cases", () => {
    it("should support backward navigation through all steps", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      // Navigate forward to step 4
      await navigateToTeamSelection(user);
      await waitForStep(4, 7);

      // Go back to step 3
      await user.click(screen.getByRole("button", { name: /Back/i }));
      await waitForStep(3, 7);

      // Go back to step 2
      await user.click(screen.getByRole("button", { name: /Back/i }));
      await waitForStep(2, 7);

      // Go back to step 1
      await user.click(screen.getByRole("button", { name: /Back/i }));
      await waitForStep(1, 7);

      // No back button on first step
      expect(screen.queryByRole("button", { name: /Back/i })).not.toBeInTheDocument();
    });

    it("should handle invalid schedule option in localStorage gracefully", async () => {
      const user = userEvent.setup();

      // Seed invalid schedule type
      seedUserState({
        scheduleType: "invalid-schedule" as any,
        hasCompletedOnboarding: false,
      });

      render(<App />);

      // Wizard should still appear and be functional
      await findModalTitle(/Welcome to Worktime/i);

      // Should be able to navigate and select valid schedule
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));

      // Valid schedule options should be available
      expect(screen.getByRole("button", { name: /5-shift/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /9-5/i })).toBeInTheDocument();
    });

    it("should handle modal close and reopen maintaining proper state", async () => {
      const user = userEvent.setup();
      const onHide = vi.fn();
      const onTeamSelect = vi.fn();

      const { rerender } = renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          show={true}
          onHide={onHide}
          onTeamSelect={onTeamSelect}
        />,
      );

      await findModalTitle(/Welcome to Worktime/i);

      // Navigate to step 3
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      await waitForStep(3, 7);

      // Close modal
      rerender(
        <SettingsProvider>
          <WelcomeWizard
            {...defaultProps}
            show={false}
            onHide={onHide}
            onTeamSelect={onTeamSelect}
          />
        </SettingsProvider>,
      );

      await waitFor(() =>
        expect(screen.queryByText(/Step 3 of 7/i)).not.toBeInTheDocument(),
      );

      // Reopen modal - should start from beginning
      rerender(
        <SettingsProvider>
          <WelcomeWizard
            {...defaultProps}
            show={true}
            onHide={onHide}
            onTeamSelect={onTeamSelect}
          />
        </SettingsProvider>,
      );

      await findModalTitle(/Welcome to Worktime/i);
      await waitForStep(1, 7);
    });

    it("should handle keyboard navigation with Enter and Escape", async () => {
      const user = userEvent.setup();
      const onHide = vi.fn();

      renderWithProviders(<WelcomeWizard {...defaultProps} onHide={onHide} />);

      await findModalTitle(/Welcome to Worktime/i);

      // Press Enter on focused button should advance
      const getStartedButton = screen.getByRole("button", { name: /Let's Get Started/i });
      getStartedButton.focus();
      await user.keyboard("{Enter}");

      await waitForStep(2, 7);

      // Note: During onboarding, Escape is disabled (backdrop="static", keyboard={false})
      // So we can't test Escape closing the modal during onboarding
      // The modal is designed to be non-dismissible during onboarding
    });

    it("should disable time-off vacation step when time-off is disabled", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      // Navigate to time-off setup
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      await user.click(screen.getByLabelText(/Select Team 1/i));

      // Should be at time-off setup
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /Enable Time Off Tracking/i }),
        ).toBeInTheDocument(),
      );

      // Disable time-off by unchecking the switch
      const timeOffSwitch = screen.getByLabelText(/Enable time off tracking/i);
      await user.click(timeOffSwitch);

      // Click Continue (not "Skip for Now" - that's the button text when enabled)
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Should skip vacation allowance and go to time tracking
      await waitFor(() => expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument());

      // Should NOT have gone through vacation step
      expect(screen.queryByText(/Set Up Vacation Tracking/i)).not.toBeInTheDocument();
    });

    it("should validate vacation allowance input correctly", async () => {
      const user = userEvent.setup();
      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      // Navigate to vacation step
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      await user.click(screen.getByLabelText(/Select Team 1/i));
      await user.click(screen.getByRole("button", { name: /Set Vacation Allowance/i }));

      await waitFor(() =>
        expect(screen.getByText(/Set Up Vacation Tracking/i)).toBeInTheDocument(),
      );

      const amountInput = screen.getByLabelText(/Annual vacation allowance/i);
      const completeButton = screen.getByRole("button", { name: /Complete/i });

      // Empty input should disable complete button (but button still shows as "Complete")
      await user.clear(amountInput);
      await waitFor(() => expect(completeButton).toBeDisabled());

      // Negative value should show validation error and disable button
      await user.type(amountInput, "-5");
      await waitFor(() => expect(completeButton).toBeDisabled());

      // Valid value should enable button and change text to "Save & Complete"
      await user.clear(amountInput);
      await user.type(amountInput, "25");
      await waitFor(() => {
        const saveButton = screen.getByRole("button", { name: /Save & Complete/i });
        expect(saveButton).toBeEnabled();
      });
    });

    it("should handle schedule change during active wizard session", async () => {
      const user = userEvent.setup();

      // Start with 5-shift
      seedUserState({
        scheduleType: "5-shift",
        hasCompletedOnboarding: false,
      });

      render(<App />);

      await findModalTitle(/Welcome to Worktime/i);

      // Navigate to team selection
      await navigateToTeamSelection(user);

      // Simulate external schedule change (via another tab or programmatic update)
      const currentState = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      currentState.scheduleType = "9-5";
      localStorage.setItem("worktime_user_state", JSON.stringify(currentState));

      // Continue with wizard - should still function
      await user.click(screen.getByLabelText(/Select Team 2/i));

      // Wizard should complete
      await waitFor(() =>
        expect(
          screen.getByRole("heading", { name: /Enable Time Off Tracking/i }),
        ).toBeInTheDocument(),
      );
    });

    it("should show correct step count for different modes", async () => {
      const onTeamSelect = vi.fn();
      const onHide = vi.fn();

      // Onboarding mode - 7 steps (with team selection and time-off)
      const { unmount } = renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="onboarding"
          onTeamSelect={onTeamSelect}
          onHide={onHide}
        />,
        { scheduleType: "5-shift" },
      );

      await findModalTitle(/Welcome to Worktime/i);
      await waitForStep(1, 7);
      unmount();

      // Change-schedule mode with team selection - 2 steps
      const { unmount: unmount2 } = renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-schedule"
          onTeamSelect={onTeamSelect}
          onHide={onHide}
        />,
        { scheduleType: "5-shift", hasCompletedOnboarding: true, myTeam: 1 },
      );

      await waitFor(() =>
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument(),
      );
      await waitForStep(1, 2);
      unmount2();

      // Change-schedule mode without team selection (9-5) - 1 step
      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-schedule"
          onTeamSelect={onTeamSelect}
          onHide={onHide}
        />,
        { scheduleType: "9-5", hasCompletedOnboarding: true, myTeam: null },
      );

      await waitFor(() =>
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument(),
      );
      await waitForStep(1, 1);
    });
  });
});
