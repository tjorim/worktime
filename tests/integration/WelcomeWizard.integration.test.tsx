/**
 * End-to-end integration tests for WelcomeWizard flows.
 *
 * These tests simulate complete user journeys through the wizard across
 * different modes (onboarding, change-team, change-schedule) and schedule
 * configurations to ensure all state transitions work correctly.
 */
import { render, screen, waitFor } from "@testing-library/react";
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
      await waitFor(() => {
        expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
      });

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
  });

  // ==========================================================================
  // Change-Schedule Flow Tests
  // ==========================================================================

  describe("Change-Schedule Flow", () => {
    it("should open wizard in change-schedule mode", async () => {
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
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("Edge Cases", () => {
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

    it("should proceed to time tracking when time off is disabled", async () => {
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
        expect(screen.getByRole("heading", { name: /Set Up Time Off/i })).toBeInTheDocument(),
      );

      // Disable time-off by unchecking the switch
      const timeOffSwitch = screen.getByLabelText(/Enable time off/i);
      await user.click(timeOffSwitch);

      // Click Continue
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Should go to time tracking
      await waitFor(() => expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument());

      // Should NOT show vacation allowance heading
      expect(screen.queryByText(/Vacation allowance/i)).not.toBeInTheDocument();
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
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Simulate external schedule change (via another tab or programmatic update)
      const currentState = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      currentState.scheduleType = "9-5";
      localStorage.setItem("worktime_user_state", JSON.stringify(currentState));

      // Continue with wizard - should still function
      await user.click(screen.getByLabelText(/Select Team 2/i));

      // Wizard should complete
      await waitFor(() =>
        expect(screen.getByRole("heading", { name: /Set Up Time Off/i })).toBeInTheDocument(),
      );
    });

    it("should show correct step count for different modes", async () => {
      const onTeamSelect = vi.fn();
      const onHide = vi.fn();

      // Onboarding mode - 6 steps (with team selection and time off)
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
      await waitFor(() => expect(screen.getByText(/Step 1 of 6/i)).toBeInTheDocument());
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
      await waitFor(() => expect(screen.getByText(/Step 1 of 2/i)).toBeInTheDocument());
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
      await waitFor(() => expect(screen.getByText(/Step 1 of 1/i)).toBeInTheDocument());
    });
  });
});
