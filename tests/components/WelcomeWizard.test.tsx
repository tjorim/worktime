import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../../src/App";
import { WelcomeWizard } from "../../src/components/WelcomeWizard";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";

const defaultProps = {
  show: true,
  onTeamSelect: vi.fn(),
  onHide: vi.fn(),
  isLoading: false,
};

const defaultUserState = {
  hasCompletedOnboarding: false,
  myTeam: null,
  scheduleType: "5-shift",
  settings: {
    timeFormat: "24h",
    theme: "auto",
    notifications: "off",
    vacationAllowance: {
      amount: 0,
      unit: "days",
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

const seedScheduleOption = (overrides?: Partial<typeof defaultUserState>) => {
  const nextState = {
    ...defaultUserState,
    ...overrides,
    settings: {
      ...defaultUserState.settings,
      ...(overrides?.settings ?? {}),
    },
  };
  window.localStorage.setItem("worktime_user_state", JSON.stringify(nextState));
};

// Test wrapper with required providers
function renderWithProviders(ui: React.ReactElement, overrides?: Partial<typeof defaultUserState>) {
  seedScheduleOption(overrides);
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

// Test helper functions
const findModalTitle = async (text: RegExp) => {
  const headings = await screen.findAllByText(text);
  const modalHeading = headings.find((el) => el.className.includes("modal-title"));
  expect(modalHeading).toBeInTheDocument();
  return modalHeading;
};

const waitForStep = async (stepNumber: number, totalSteps: number = 6, timeout = 3000) => {
  await waitFor(
    () => {
      expect(
        screen.getByText(new RegExp(`Step ${stepNumber} of ${totalSteps}`, "i")),
      ).toBeInTheDocument();
    },
    { timeout },
  );
};

const enableTimeOffToggle = async (user: ReturnType<typeof userEvent.setup>) => {
  const toggle = screen.getByLabelText(/Enable time off/i) as HTMLInputElement;
  if (!toggle.checked) {
    await user.click(toggle);
  }
};

const navigateToTeamSelection = async (user: ReturnType<typeof userEvent.setup>) => {
  // Step 1 (welcome) -> Step 2 (features)
  const getStartedButton = screen.getByRole("button", {
    name: /Let's Get Started/i,
  });
  await user.click(getStartedButton);
  await waitForStep(2, 6);

  // Step 2 (features) -> Step 3 (schedule selection)
  const chooseScheduleButton = screen.getByRole("button", {
    name: /Choose a Schedule/i,
  });
  await user.click(chooseScheduleButton);
  await waitForStep(3, 6);

  // Step 3 (schedule selection) -> Step 4 (team selection)
  await user.click(screen.getByRole("button", { name: /5-shift/i }));
  await user.click(screen.getByRole("button", { name: /Continue/i }));
  await waitForStep(4, 6);
};

describe("WelcomeWizard", () => {
  describe("Basic rendering", () => {
    it("renders modal when show is true", () => {
      renderWithProviders(<WelcomeWizard {...defaultProps} />);
      expect(screen.getByRole("heading", { name: /Welcome to Worktime!/i })).toBeInTheDocument();
    });

    it("does not render modal when show is false", () => {
      renderWithProviders(<WelcomeWizard {...defaultProps} show={false} />);
      expect(
        screen.queryByRole("heading", {
          name: /Welcome to Worktime!/i,
        }),
      ).not.toBeInTheDocument();
    });

    it("renders all team buttons on team selection step", async () => {
      const user = userEvent.setup();
      renderWithProviders(<WelcomeWizard {...defaultProps} />);

      // Navigate to team selection step
      await navigateToTeamSelection(user);

      for (let team = 1; team <= 5; team++) {
        expect(screen.getByText(`Team ${team}`)).toBeInTheDocument();
      }
    });
  });

  describe("Team selection", () => {
    it("calls onTeamSelect when team button is clicked", async () => {
      const user = userEvent.setup();
      const mockOnTeamSelect = vi.fn();

      renderWithProviders(<WelcomeWizard {...defaultProps} onTeamSelect={mockOnTeamSelect} />);

      // Navigate to team selection step
      await navigateToTeamSelection(user);

      const team3Button = screen.getByText("Team 3");
      await user.click(team3Button);

      expect(mockOnTeamSelect).toHaveBeenCalledWith(3);
    });
  });

  describe("Loading state", () => {
    it("shows loading spinner when isLoading is true", () => {
      renderWithProviders(<WelcomeWizard {...defaultProps} isLoading={true} />);
      expect(screen.getByText("Setting up your experience...")).toBeInTheDocument();
    });

    it("hides wizard content when loading", () => {
      renderWithProviders(<WelcomeWizard {...defaultProps} isLoading={true} />);

      // Wizard content should not be present when loading
      expect(screen.queryByText("Let's Get Started!")).not.toBeInTheDocument();
    });
  });

  describe("Modal behavior", () => {
    it("accepts onHide callback prop", () => {
      const mockOnHide = vi.fn();
      renderWithProviders(<WelcomeWizard {...defaultProps} onHide={mockOnHide} />);

      // Modal renders without errors and accepts the callback
      expect(screen.getByText("Welcome to Worktime! 👋")).toBeInTheDocument();
      expect(mockOnHide).toBeDefined();
    });

    it("calls onDefer when 'Maybe Later' is clicked", async () => {
      const user = userEvent.setup();
      const mockOnDefer = vi.fn();
      const mockOnHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard {...defaultProps} onDefer={mockOnDefer} onHide={mockOnHide} />,
      );

      const maybeLaterButton = screen.getByRole("button", { name: /Maybe Later/i });
      await user.click(maybeLaterButton);

      // Should call onDefer, not onHide
      expect(mockOnDefer).toHaveBeenCalledTimes(1);
      expect(mockOnHide).not.toHaveBeenCalled();
    });

    it("falls back to onHide when onDefer is not provided", async () => {
      const user = userEvent.setup();
      const mockOnHide = vi.fn();

      renderWithProviders(<WelcomeWizard {...defaultProps} onHide={mockOnHide} />);

      const maybeLaterButton = screen.getByRole("button", { name: /Maybe Later/i });
      await user.click(maybeLaterButton);

      // Should fall back to onHide when onDefer is not provided
      expect(mockOnHide).toHaveBeenCalledTimes(1);
    });
  });

  describe("Time Off Setup Step", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it("should show time off setup after team selection", async () => {
      const mockOnTeamSelect = vi.fn();
      const mockOnHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard show={true} onTeamSelect={mockOnTeamSelect} onHide={mockOnHide} />,
      );

      const user = userEvent.setup();

      // Navigate through wizard
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Select a team
      await user.click(screen.getByRole("button", { name: /Select Team 1/i }));

      // Should be on time off setup step
      expect(screen.getByRole("heading", { name: /Set Up Time Off/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/Enable time off/i)).toBeInTheDocument();
      expect(mockOnHide).not.toHaveBeenCalled(); // Not completed yet
    });

    it("should allow continuing past time off setup when disabled", async () => {
      const mockOnHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          show={true}
          onTeamSelect={vi.fn()}
          onHide={mockOnHide}
          startStep="timeoff-setup"
        />,
        { settings: { enableTimeOff: false } },
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument();
    });

    it("should carry vacation allowance when values entered", async () => {
      const mockOnHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          show={true}
          onTeamSelect={vi.fn()}
          onHide={mockOnHide}
          startStep="timeoff-setup"
        />,
        { settings: { enableTimeOff: false } },
      );

      const user = userEvent.setup();

      await enableTimeOffToggle(user);
      const amountInput = screen.getByLabelText(/Vacation allowance/i);
      await user.clear(amountInput);
      await user.type(amountInput, "28");

      // Select hours unit
      await user.selectOptions(screen.getByLabelText(/Unit/i), "hours");

      // Complete
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Should continue to time tracking setup
      expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument();
      expect(mockOnHide).not.toHaveBeenCalled();
    });

    it("should allow navigating back from time off setup", async () => {
      renderWithProviders(
        <WelcomeWizard
          show={true}
          onTeamSelect={vi.fn()}
          onHide={vi.fn()}
          startStep="timeoff-setup"
        />,
        { settings: { enableTimeOff: false } },
      );

      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: /Back/i }));

      // Should go back to team selection
      expect(screen.getByText(/Choose your team/i)).toBeInTheDocument();
    });

    it("should show correct progress for time off setup step", () => {
      renderWithProviders(
        <WelcomeWizard
          show={true}
          onTeamSelect={vi.fn()}
          onHide={vi.fn()}
          startStep="timeoff-setup"
        />,
        { settings: { enableTimeOff: false } },
      );

      expect(screen.getByText(/Step 5 of 6/i)).toBeInTheDocument();
    });

    it("should show validation error for negative vacation amount", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WelcomeWizard
          show={true}
          onTeamSelect={vi.fn()}
          onHide={vi.fn()}
          startStep="timeoff-setup"
        />,
      );

      await enableTimeOffToggle(user);
      const amountInput = screen.getByLabelText(/Vacation allowance/i);
      await user.type(amountInput, "-5");

      // Should show validation error
      expect(screen.getByText(/Please enter a valid number \(0 or greater\)/i)).toBeVisible();

      // Complete button should be disabled
      const continueButton = screen.getByRole("button", { name: /Continue/i });
      expect(continueButton).toBeDisabled();
    });

    it("should enable Continue button for valid positive amount", async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <WelcomeWizard
          show={true}
          onTeamSelect={vi.fn()}
          onHide={vi.fn()}
          startStep="timeoff-setup"
        />,
      );

      await enableTimeOffToggle(user);
      const amountInput = screen.getByLabelText(/Vacation allowance/i);
      await user.type(amountInput, "25");

      // Input should not have invalid styling for valid input
      expect(amountInput).not.toHaveClass("is-invalid");

      // Save button should be enabled
      const continueButton = screen.getByRole("button", { name: /Continue/i });
      expect(continueButton).toBeEnabled();
    });

    it("should handle zero amount as valid (disables vacation tracking)", async () => {
      const user = userEvent.setup();
      const mockOnHide = vi.fn();
      renderWithProviders(
        <WelcomeWizard
          show={true}
          onTeamSelect={vi.fn()}
          onHide={mockOnHide}
          startStep="timeoff-setup"
        />,
        { settings: { enableTimeOff: false } },
      );

      await enableTimeOffToggle(user);
      const amountInput = screen.getByLabelText(/Vacation allowance/i);
      await user.type(amountInput, "0");

      // Input should not have invalid styling for zero
      expect(amountInput).not.toHaveClass("is-invalid");

      // Continue button should be enabled
      const continueButton = screen.getByRole("button", { name: /Continue/i });
      expect(continueButton).toBeEnabled();

      // Click the continue button
      await user.click(continueButton);

      // Finish setup to trigger onHide
      await user.click(screen.getByRole("button", { name: /Finish Setup/i }));

      // Should call onHide with 0 amount (explicitly disabling vacation tracking)
      expect(mockOnHide).toHaveBeenCalledWith(
        expect.objectContaining({
          vacationAllowance: {
            amount: 0,
            unit: "days",
          },
        }),
      );
    });
  });

  describe("Integration tests", () => {
    let originalLocalStorage: Storage;
    let testStorage: Record<string, string>;

    beforeEach(() => {
      // Clear localStorage and ensure consistent test state
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

      window.localStorage.setItem("worktime_user_state", JSON.stringify(defaultUserState));
    });

    afterEach(() => {
      // Restore original localStorage to prevent cross-test leakage
      Object.defineProperty(window, "localStorage", {
        value: originalLocalStorage,
        writable: true,
      });
      window.localStorage.clear?.();
      vi.clearAllMocks();
      // Clean up any DOM modifications
      document.body.className = "";
      document.documentElement.removeAttribute("data-bs-theme");
    });

    it("shows WelcomeWizard on first load and after reset", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Verify welcome wizard appears
      await findModalTitle(/Welcome to Worktime/i);

      // Navigate through wizard to team selection
      await navigateToTeamSelection(user);

      // Complete team selection
      await user.click(screen.getByLabelText(/Select Team 1/i));

      // Now on time off setup step
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      await user.click(screen.getByRole("button", { name: /Finish Setup/i }));

      await waitFor(() =>
        expect(screen.queryByText(/Welcome to Worktime/i)).not.toBeInTheDocument(),
      );

      // Simulate reset
      fireEvent.click(screen.getByLabelText(/Settings/i));
      fireEvent.click(screen.getByText(/Reset Settings/i));

      const welcomeHeadingsAfterReset = await screen.findAllByText(/Welcome to Worktime/i);
      const modalHeadingAfterReset = welcomeHeadingsAfterReset.find((el) =>
        el.className.includes("modal-title"),
      );
      expect(modalHeadingAfterReset).toBeInTheDocument();
    });

    it("lets user skip team selection and browse all teams", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Verify welcome wizard appears
      await findModalTitle(/Welcome to Worktime/i);

      // Navigate through wizard to team selection
      await navigateToTeamSelection(user);

      // Skip team selection
      const browseButton = screen.getByRole("button", {
        name: /Browse All Teams/i,
      });
      await user.click(browseButton);

      // Now on time off setup step
      expect(screen.getByRole("heading", { name: /Set Up Time Off/i })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Finish Setup/i }));

      // Modal should close
      await waitFor(() =>
        expect(screen.queryByText(/Welcome to Worktime/i)).not.toBeInTheDocument(),
      );

      // Should be able to open settings and reset again
      await user.click(screen.getByLabelText(/Settings/i));
      await user.click(screen.getByText(/Reset Settings/i));

      const welcomeHeadingsAfterReset = await screen.findAllByText(/Welcome to Worktime/i);
      const modalHeadingAfterReset = welcomeHeadingsAfterReset.find((el) =>
        el.className.includes("modal-title"),
      );
      expect(modalHeadingAfterReset).toBeInTheDocument();
    });

    it("shows correct progress and disables buttons when loading", async () => {
      const user = userEvent.setup();
      render(<App />);

      // Verify welcome wizard appears with correct initial step
      await findModalTitle(/Welcome to Worktime/i);
      expect(screen.getByText(/Step 1 of 6/i)).toBeInTheDocument();

      // Navigate to features step
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      expect(screen.getByText(/Step 2 of 6/i)).toBeInTheDocument();

      // Navigate to schedule selection step
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      expect(screen.getByText(/Step 3 of 6/i)).toBeInTheDocument();

      // Choose 5-shift to reveal team selection
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      expect(screen.getByText(/Step 4 of 6/i)).toBeInTheDocument();

      // Select a team to go to vacation allowance step
      await user.click(screen.getByLabelText(/Select Team 1/i));
      expect(screen.getByText(/Step 5 of 6/i)).toBeInTheDocument();
    });

    it("should save vacation allowance when browsing all teams without selecting one", async () => {
      const user = userEvent.setup();
      const userState = {
        ...defaultUserState,
        settings: {
          ...defaultUserState.settings,
          enableTimeOff: false,
        },
      };
      window.localStorage.setItem("worktime_user_state", JSON.stringify(userState));
      render(<App />);

      // Verify welcome wizard appears
      await findModalTitle(/Welcome to Worktime/i);

      // Navigate through wizard to team selection
      await navigateToTeamSelection(user);

      // Click "Browse All Teams" instead of selecting a team
      await user.click(screen.getByRole("button", { name: /Browse All Teams/i }));

      // Should be on time off setup step
      expect(screen.getByRole("heading", { name: /Set Up Time Off/i })).toBeInTheDocument();
      await enableTimeOffToggle(user);

      // Enter vacation allowance
      const amountInput = screen.getByLabelText(/Vacation allowance/i);
      await user.clear(amountInput);
      await user.type(amountInput, "35");

      // Complete wizard
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: /Finish Setup/i }));

      // Modal should close
      await waitFor(() =>
        expect(screen.queryByText(/Set Up Time Tracking/i)).not.toBeInTheDocument(),
      );

      // Verify vacation allowance was saved to localStorage even without selecting a team
      const saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.settings?.vacationAllowance?.amount).toBe(35);
      expect(saved.settings?.vacationAllowance?.unit).toBe("days");
      expect(saved.hasCompletedOnboarding).toBe(true);
      expect(saved.myTeam).toBeNull(); // No team was selected
    });

    it("should save vacation allowance when updated in change-team mode", async () => {
      const user = userEvent.setup();
      const userState = {
        ...defaultUserState,
        settings: {
          ...defaultUserState.settings,
          enableTimeOff: false,
        },
      };
      window.localStorage.setItem("worktime_user_state", JSON.stringify(userState));
      render(<App />);

      // Complete initial onboarding
      await findModalTitle(/Welcome to Worktime/i);
      await navigateToTeamSelection(user);
      await user.click(screen.getByLabelText(/Select Team 1/i));
      await enableTimeOffToggle(user);

      // Set initial vacation allowance
      const initialAmountInput = screen.getByLabelText(/Vacation allowance/i);
      await user.clear(initialAmountInput);
      await user.type(initialAmountInput, "25");
      await user.click(screen.getByRole("button", { name: /Continue/i }));
      await user.click(screen.getByRole("button", { name: /Finish Setup/i }));

      // Wait for wizard to close
      await waitFor(() =>
        expect(screen.queryByText(/Set Up Time Tracking/i)).not.toBeInTheDocument(),
      );

      // Verify initial vacation allowance was saved
      let saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.settings?.vacationAllowance?.amount).toBe(25);
      expect(saved.myTeam).toBe(1);

      // Now open the wizard in change-team mode via Settings panel
      const settingsButton = screen.getByRole("button", { name: /^Settings$/i });
      await user.click(settingsButton);
      const selectTeamButton = screen.getByRole("button", { name: /Select Team/i });
      await user.click(selectTeamButton);

      // Should show the wizard again
      await waitFor(() => expect(screen.getByText(/Choose your team/i)).toBeInTheDocument());

      // In change-team mode, selecting a team should close the wizard immediately (no vacation step)
      await user.click(screen.getByLabelText(/Select Team 2/i));

      // Wait for wizard to close
      await waitFor(() => expect(screen.queryByText(/Choose your team/i)).not.toBeInTheDocument());

      // Verify team was changed but vacation allowance remains unchanged
      saved = JSON.parse(localStorage.getItem("worktime_user_state") || "{}");
      expect(saved.settings?.vacationAllowance?.amount).toBe(25); // Unchanged from onboarding
      expect(saved.settings?.vacationAllowance?.unit).toBe("days");
      expect(saved.myTeam).toBe(2); // Team was changed
    });

    it("should navigate directly to schedule selection in change-schedule mode", async () => {
      const onScheduleSelect = vi.fn();
      const onHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-schedule"
          onScheduleSelect={onScheduleSelect}
          onHide={onHide}
        />,
      );

      // Should start directly at schedule selection
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });

      // Should show step 1 of 2 (schedule selection + team selection if needed)
      expect(screen.getByText(/Step 1 of/i)).toBeInTheDocument();
    });

    it("should show Cancel button in change-schedule mode", async () => {
      const user = userEvent.setup();
      const onHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard {...defaultProps} mode="change-schedule" onHide={onHide} />,
      );

      // Should show Cancel button instead of Skip
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      expect(cancelButton).toBeInTheDocument();

      // Cancel should call onHide
      await user.click(cancelButton);
      expect(onHide).toHaveBeenCalledTimes(1);
    });

    it("should show Save Schedule button when selecting schedule without team selection in change-schedule mode", async () => {
      const user = userEvent.setup();
      const onScheduleSelect = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-schedule"
          onScheduleSelect={onScheduleSelect}
        />,
      );

      // Wait for schedule selection to render
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });

      // Select a schedule that doesn't require team selection (9-5)
      await user.click(screen.getByRole("button", { name: /9-5/i }));

      // Wait for button to update and show "Save Schedule"
      await waitFor(() => {
        const saveButton = screen.getByRole("button", { name: /Save Schedule/i });
        expect(saveButton).toBeInTheDocument();
      });
    });

    it("should navigate to team selection when schedule requires teams in change-schedule mode", async () => {
      const user = userEvent.setup();
      const onScheduleSelect = vi.fn();
      const onTeamSelect = vi.fn();
      const onHide = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          mode="change-schedule"
          onScheduleSelect={onScheduleSelect}
          onTeamSelect={onTeamSelect}
          onHide={onHide}
        />,
      );

      // Wait for schedule selection to render
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });

      // Select a schedule that requires team selection (5-shift)
      await user.click(screen.getByRole("button", { name: /5-shift/i }));

      // Should show Continue button (not Save Schedule) because team selection is needed
      await waitFor(() => {
        const continueButton = screen.getByRole("button", { name: /Continue/i });
        expect(continueButton).toBeInTheDocument();
      });

      // Click Continue to move to team selection
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Should move to team selection
      await waitFor(() => {
        expect(screen.getByText(/Choose your team/i)).toBeInTheDocument();
      });

      // Select a team - this should call onTeamSelect and onHide
      await user.click(screen.getByLabelText(/Select Team 3/i));

      // Verify onTeamSelect was called with team 3
      await waitFor(() => {
        expect(onTeamSelect).toHaveBeenCalledWith(3);
      });

      // Verify onHide was called (wizard closes immediately in change-schedule mode)
      expect(onHide).toHaveBeenCalled();
    });
  });

  describe("Schedule change integration tests", () => {
    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it("should open Select Schedule wizard when Select Schedule button is clicked", async () => {
      const user = userEvent.setup();
      window.localStorage.setItem("worktime_user_state", JSON.stringify(defaultUserState));
      render(<App />);

      // Complete initial onboarding by manually navigating through wizard
      await findModalTitle(/Welcome to Worktime/i);

      // Step 1: Welcome -> Features
      const getStartedButton = screen.getByRole("button", { name: /Let's Get Started/i });
      await user.click(getStartedButton);

      // Step 2: Features -> Schedule Selection
      await waitFor(() => {
        expect(screen.getByText(/What can Worktime do\?/i)).toBeInTheDocument();
      });
      const chooseScheduleButton = screen.getByRole("button", { name: /Choose a Schedule/i });
      await user.click(chooseScheduleButton);

      // Step 3: Schedule Selection -> Team Selection
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /5-shift/i }));
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Step 4: Team Selection -> Time Off Setup
      await waitFor(() => {
        expect(screen.getByText(/Choose your team/i)).toBeInTheDocument();
      });
      await user.click(screen.getByLabelText(/Select Team 1/i));

      // Step 5: Time Off Setup -> Time Tracking
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: /Set Up Time Off/i })).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /Continue/i }));

      // Step 6: Time Tracking -> Finish
      await waitFor(() => {
        expect(screen.getByText(/Set Up Time Tracking/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole("button", { name: /Finish Setup/i }));

      // Wait for wizard to close
      await waitFor(() =>
        expect(screen.queryByText(/Set Up Time Tracking/i)).not.toBeInTheDocument(),
      );

      // Open Settings panel (match exact "Settings", not "Reset Settings")
      const settingsButton = screen.getByRole("button", { name: /^Settings$/i });
      await user.click(settingsButton);

      // Click Select Schedule button
      const selectScheduleButton = await waitFor(() => {
        const button = screen.getByRole("button", { name: /Select Schedule/i });
        expect(button).toBeInTheDocument();
        return button;
      });
      await user.click(selectScheduleButton);

      // Should open wizard in change-schedule mode
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });
    });
  });

  describe("Error handling", () => {
    it("should not crash when onScheduleSelect is provided", async () => {
      const user = userEvent.setup();
      const onScheduleSelectMock = vi.fn();

      // Test that the component works with onScheduleSelect prop
      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          onScheduleSelect={onScheduleSelectMock}
          mode="change-schedule"
        />,
      );

      // Navigate to schedule selection
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });

      // Select a schedule - should not crash
      const fiveShiftButton = screen.getByRole("button", { name: /5-shift/i });
      await user.click(fiveShiftButton);

      // Component should remain functional
      expect(fiveShiftButton).toBeInTheDocument();
    });

    it("should not allow selection of disabled schedules", async () => {
      const user = userEvent.setup();
      const onScheduleSelectMock = vi.fn();

      renderWithProviders(
        <WelcomeWizard
          {...defaultProps}
          onScheduleSelect={onScheduleSelectMock}
          mode="change-schedule"
        />,
      );

      // Navigate to schedule selection
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });

      // Find disabled schedule button (2-shift is marked as unavailable)
      const twoShiftButton = screen.getByRole("button", { name: /2-shift/i });
      const weekendShiftButton = screen.getByRole("button", { name: /Weekend shift/i });

      // 2-shift should be disabled while weekend shift is available
      expect(twoShiftButton).toBeDisabled();
      expect(weekendShiftButton).not.toBeDisabled();

      // Attempting to click should not select disabled option
      await user.click(twoShiftButton);

      // Button should remain disabled even if clicked
      expect(twoShiftButton).toBeDisabled();
    });

    it("should show tooltip on disabled schedule options", async () => {
      renderWithProviders(<WelcomeWizard {...defaultProps} mode="change-schedule" />);

      // Navigate to schedule selection
      await waitFor(() => {
        expect(screen.getByText(/Which roster matches your team\?/i)).toBeInTheDocument();
      });

      // Find disabled schedule button
      const twoShiftButton = screen.getByRole("button", { name: /2-shift/i });

      // Should have a title attribute for tooltip
      expect(twoShiftButton).toHaveAttribute("title", "This schedule option is coming soon");
    });

    it("should handle schedule selection in onboarding flow", async () => {
      const user = userEvent.setup();

      renderWithProviders(<WelcomeWizard {...defaultProps} />);

      // Navigate through the wizard
      const getStartedButton = screen.getByRole("button", {
        name: /Let's Get Started/i,
      });
      await user.click(getStartedButton);
      await waitForStep(2, 6);

      const chooseScheduleButton = screen.getByRole("button", {
        name: /Choose a Schedule/i,
      });
      await user.click(chooseScheduleButton);
      await waitForStep(3, 6);

      // Select a valid schedule
      const fiveShiftButton = screen.getByRole("button", { name: /5-shift/i });
      await user.click(fiveShiftButton);

      // Verify button is now highlighted/selected
      expect(fiveShiftButton).toHaveClass("btn-primary");

      // Continue button should be enabled
      const continueButton = screen.getByRole("button", { name: /Continue/i });
      expect(continueButton).not.toBeDisabled();
    });

    it("should not proceed without schedule selection", async () => {
      const user = userEvent.setup();

      // Clear any pre-selected schedule
      const emptyUserState = {
        ...defaultUserState,
        scheduleType: null,
      };
      window.localStorage.setItem("worktime_user_state", JSON.stringify(emptyUserState));

      // Render without seedScheduleOption() to preserve the null scheduleType
      render(
        <SettingsProvider>
          <ToastProvider>
            <WelcomeWizard {...defaultProps} />
          </ToastProvider>
        </SettingsProvider>,
      );

      // Navigate to schedule selection
      const getStartedButton = screen.getByRole("button", {
        name: /Let's Get Started/i,
      });
      await user.click(getStartedButton);
      await waitForStep(2, 5); // 5 steps total when no schedule selected (no team selection)

      const chooseScheduleButton = screen.getByRole("button", {
        name: /Choose a Schedule/i,
      });
      await user.click(chooseScheduleButton);
      await waitForStep(3, 5); // 5 steps total when no schedule selected (no team selection)

      // Without selecting a schedule, the continue button should be disabled
      const continueButtons = screen.getAllByRole("button", { name: /Continue/i });
      const continueButton = continueButtons[continueButtons.length - 1];

      // Button should be disabled without explicit schedule selection
      expect(continueButton).toBeDisabled();
    });

    it("should not implicitly default to 5-shift when navigating to schedule selection", async () => {
      const onScheduleSelect = vi.fn();
      const user = userEvent.setup();

      // Clear any pre-selected schedule
      const emptyUserState = {
        ...defaultUserState,
        scheduleType: null,
      };
      window.localStorage.setItem("worktime_user_state", JSON.stringify(emptyUserState));

      // Render without seedScheduleOption() to preserve the null scheduleType
      render(
        <SettingsProvider>
          <ToastProvider>
            <WelcomeWizard {...defaultProps} onScheduleSelect={onScheduleSelect} />
          </ToastProvider>
        </SettingsProvider>,
      );

      // Navigate to schedule selection
      const getStartedButton = screen.getByRole("button", {
        name: /Let's Get Started/i,
      });
      await user.click(getStartedButton);
      await waitForStep(2, 5); // 5 steps total when no schedule selected (no team selection)

      const chooseScheduleButton = screen.getByRole("button", {
        name: /Choose a Schedule/i,
      });
      await user.click(chooseScheduleButton);
      await waitForStep(3, 5); // 5 steps total when no schedule selected (no team selection)

      // Verify onScheduleSelect was not called implicitly
      expect(onScheduleSelect).not.toHaveBeenCalled();

      // Verify continue button is disabled without explicit selection
      const continueButtons = screen.getAllByRole("button", { name: /Continue/i });
      const continueButton = continueButtons[continueButtons.length - 1];
      expect(continueButton).toBeDisabled();
    });
  });

  describe("Onboarding validation tests", () => {
    let originalLocalStorage: Storage;
    let testStorage: Record<string, string>;

    beforeEach(() => {
      vi.clearAllMocks();
      testStorage = {};
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
    });

    afterEach(() => {
      Object.defineProperty(window, "localStorage", {
        value: originalLocalStorage,
        writable: true,
      });
      window.localStorage.clear?.();
      vi.clearAllMocks();
      document.body.className = "";
      document.documentElement.removeAttribute("data-bs-theme");
    });

    it("should disable the continue button when no schedule is selected", async () => {
      // Start with no schedule selected
      const userStateWithoutSchedule = {
        ...defaultUserState,
        scheduleType: null,
      };
      window.localStorage.setItem("worktime_user_state", JSON.stringify(userStateWithoutSchedule));

      const user = userEvent.setup();
      render(<App />);

      // Wait for wizard to appear
      await findModalTitle(/Welcome to Worktime/i);

      // Navigate to features step
      await user.click(screen.getByRole("button", { name: /Let's Get Started/i }));
      await waitForStep(2, 5); // 5 steps when no schedule (no team selection)

      // Navigate to schedule selection step
      await user.click(screen.getByRole("button", { name: /Choose a Schedule/i }));
      await waitForStep(3, 5);

      // Try to continue without selecting a schedule
      const continueButtons = screen.getAllByRole("button", { name: /Continue/i });
      const continueButton = continueButtons[continueButtons.length - 1];

      // Button should be disabled if no schedule is selected
      expect(continueButton).toBeDisabled();
    });

    it("should render the wizard when scheduleType is null", async () => {
      const userStateWithoutSchedule = {
        ...defaultUserState,
        scheduleType: null,
      };
      window.localStorage.setItem("worktime_user_state", JSON.stringify(userStateWithoutSchedule));

      render(<App />);

      // Wait for wizard to appear
      await findModalTitle(/Welcome to Worktime/i);

      const modalHeading = await screen.findByRole("heading", { name: /Welcome to Worktime/i });
      expect(modalHeading).toBeInTheDocument();
    });
  });
});
