import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ScheduleTabView } from "../../src/components/ScheduleTabView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider, useSettings } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { dayjs } from "../../src/utils/dateTimeUtils";
import type { ScheduleOption } from "../../src/data/rosters";

// Mock the child components with schedule type support
vi.mock("../../src/components/schedule/TodayView", () => ({
  TodayView: ({
    myTeam,
    viewingScheduleType,
  }: {
    myTeam: number | null;
    viewingScheduleType?: ScheduleOption | null;
  }) => (
    <div data-testid="today-view">
      TodayView - Team {myTeam} - Schedule: {viewingScheduleType || "default"}
    </div>
  ),
}));

vi.mock("../../src/components/schedule/WeekView", () => ({
  WeekView: ({
    myTeam,
    viewingScheduleType,
  }: {
    myTeam: number | null;
    viewingScheduleType?: ScheduleOption | null;
  }) => (
    <div data-testid="schedule-view">
      WeekView - Team {myTeam} - Schedule: {viewingScheduleType || "default"}
    </div>
  ),
}));

vi.mock("../../src/components/TransferView", () => ({
  TransferView: ({ myTeam }: { myTeam: number | null }) => (
    <div data-testid="transfer-view">TransferView - Team {myTeam}</div>
  ),
}));

const defaultProps = {
  myTeam: 1,
  currentDate: dayjs("2025-01-15"),
  setCurrentDate: vi.fn(),
  isActive: true,
};

// Helper to render with all required providers
// Note: SettingsProvider defaults scheduleType to null (before onboarding)
function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <SettingsProvider>
        <EventStoreProvider>{ui}</EventStoreProvider>
      </SettingsProvider>
    </ToastProvider>,
  );
}

describe("ScheduleTabView", () => {
  describe("View mode rendering", () => {
    it("renders view mode toggle buttons", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      expect(screen.getByRole("button", { name: /Today/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Week/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Transfers/i })).toBeInTheDocument();
    });

    it("shows Today view by default", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);
      expect(
        screen.getByText("Select a schedule to view the team lineup and shift details."),
      ).toBeInTheDocument();
      expect(screen.queryByTestId("today-view")).not.toBeInTheDocument();
    });
  });

  describe("View mode switching", () => {
    it("switches to Week view when Week button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "5-shift");

      const weekButton = screen.getByRole("button", { name: /Week/i });
      await user.click(weekButton);

      expect(screen.getByTestId("schedule-view")).toBeInTheDocument();
      expect(screen.queryByTestId("today-view")).not.toBeInTheDocument();
    });

    it("switches back to Today view when Today button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "5-shift");

      // First switch to Week view
      const weekButton = screen.getByRole("button", { name: /Week/i });
      await user.click(weekButton);
      expect(screen.getByTestId("schedule-view")).toBeInTheDocument();

      // Then switch back to Today view
      const todayButton = screen.getByRole("button", { name: /Today/i });
      await user.click(todayButton);
      expect(screen.getByTestId("today-view")).toBeInTheDocument();
      expect(screen.queryByTestId("schedule-view")).not.toBeInTheDocument();
    });

    it("switches to Transfer view when Transfers button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const transferButton = screen.getByRole("button", { name: /Transfers/i });
      await user.click(transferButton);

      expect(screen.getByTestId("transfer-view")).toBeInTheDocument();
      expect(screen.queryByTestId("today-view")).not.toBeInTheDocument();
      expect(screen.queryByTestId("schedule-view")).not.toBeInTheDocument();
    });
  });

  describe("Props passing", () => {
    it("passes myTeam prop to TodayView", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} myTeam={3} />);
      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "5-shift");
      expect(screen.getByTestId("today-view")).toHaveTextContent("Team 3");
    });

    it("passes myTeam prop to WeekView", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} myTeam={3} />);

      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "5-shift");

      const weekButton = screen.getByRole("button", { name: /Week/i });
      await user.click(weekButton);

      expect(screen.getByTestId("schedule-view")).toHaveTextContent("Team 3");
    });
  });

  describe("Schedule selector", () => {
    it("renders schedule selector dropdown with available schedules", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      // Should have a schedule selector
      const selector = screen.getByLabelText(/View schedule:/i);
      expect(selector).toBeInTheDocument();
      expect(selector).toBeInstanceOf(HTMLSelectElement);
    });

    it("shows current schedule as selected option", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const selector = screen.getByLabelText(/View schedule:/i) as HTMLSelectElement;
      // Default schedule type is null before onboarding, so placeholder is shown
      expect(selector.value).toBe("");
      // Verify placeholder option exists
      const placeholderOption = Array.from(selector.options).find((opt) => opt.value === "");
      expect(placeholderOption).toBeDefined();
      expect(placeholderOption?.disabled).toBe(true);
    });

    it("displays multiple schedule options to choose from", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const selector = screen.getByLabelText(/View schedule:/i) as HTMLSelectElement;
      const options = Array.from(selector.options);

      // Should have multiple schedule options available (including placeholder)
      expect(options.length).toBeGreaterThan(1);

      // Filter out the placeholder option for validation
      const scheduleOptions = options.filter((opt) => opt.value !== "");
      expect(scheduleOptions.length).toBeGreaterThan(0);

      // Each schedule option should have a value and title
      scheduleOptions.forEach((option) => {
        expect(option.value).toBeTruthy();
        expect(option.text).toBeTruthy();
      });
    });

    it("passes selected schedule to TodayView", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      // Change schedule to 5-shift
      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "5-shift");

      // TodayView should receive the updated schedule type
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 5-shift");
    });

    it("passes selected schedule to WeekView", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "5-shift");

      // Switch to Week view
      const weekButton = screen.getByRole("button", { name: /Week/i });
      await user.click(weekButton);

      // WeekView should be visible
      const scheduleView = screen.getByTestId("schedule-view");
      expect(scheduleView).toBeInTheDocument();

      // WeekView should receive the updated schedule type
      expect(screen.getByTestId("schedule-view")).toHaveTextContent("Schedule: 5-shift");
    });

    it("maintains selected schedule when switching between views", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      // Change schedule to 5-shift in Today view
      const selector = screen.getByLabelText(/View schedule:/i);
      await user.selectOptions(selector, "5-shift");
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 5-shift");

      // Switch to Week view
      const weekButton = screen.getByRole("button", { name: /Week/i });
      await user.click(weekButton);

      // Week view should also show 5-shift
      expect(screen.getByTestId("schedule-view")).toHaveTextContent("Schedule: 5-shift");

      // Switch back to Today view
      const todayButton = screen.getByRole("button", { name: /Today/i });
      await user.click(todayButton);

      // Today view should still show 5-shift
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 5-shift");
    });

    it("syncs dropdown with user schedule after onboarding", async () => {
      // This test validates that the dropdown automatically updates when the user's
      // schedule changes while the component remains mounted (e.g., after onboarding)

      // Start with 9-5 schedule in localStorage
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
          },
          lastUsed: {
            activeTab: "calendar",
            scheduleView: "today",
            otherSchedule: null,
            timeOffView: "table",
            timeTrackingView: "daily",
            otherTeam: null,
          },
        }),
      );

      // Create a test component that allows us to trigger schedule changes
      let triggerScheduleChange: (() => void) | null = null;
      function TestWrapper() {
        const { setScheduleType } = useSettings();
        triggerScheduleChange = () => setScheduleType("5-shift");
        return <ScheduleTabView {...defaultProps} />;
      }

      render(
        <ToastProvider>
          <SettingsProvider>
            <EventStoreProvider>
              <TestWrapper />
            </EventStoreProvider>
          </SettingsProvider>
        </ToastProvider>,
      );

      const selector = screen.getByLabelText(/View schedule:/i) as HTMLSelectElement;

      // Initial state: schedule is "9-5", default view is Today
      expect(selector.value).toBe("9-5");
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 9-5");

      // Simulate onboarding completion by changing the schedule while component is mounted
      await act(async () => {
        triggerScheduleChange?.();
      });

      // The dropdown should now show "5-shift" to match the user's schedule
      expect(selector.value).toBe("5-shift");
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 5-shift");

      // Cleanup
      window.localStorage.removeItem("worktime_user_state");
    });
  });
});
