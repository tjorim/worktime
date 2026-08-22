import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ScheduleTabView } from "@/components/ScheduleTabView";
import { HdayHelperProvider } from "@/contexts/HdayHelperContext";
import { EventStoreProvider } from "@/contexts/EventStoreContext";
import { SettingsProvider, useSettings } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { dayjs } from "@/utils/dateTimeUtils";
import type { ScheduleOption } from "@/data/rosters";

// Mock the child components with schedule type support
vi.mock("@/components/schedule/TodayView", () => ({
  TodayView: ({
    myTeam,
    viewingScheduleType,
    onViewingScheduleTypeChange,
  }: {
    myTeam: number | null;
    viewingScheduleType?: ScheduleOption | null;
    onViewingScheduleTypeChange: (next: ScheduleOption | null) => void;
  }) => (
    <div data-testid="today-view">
      TodayView - Team {myTeam} - Schedule: {viewingScheduleType || "default"}
      <button onClick={() => onViewingScheduleTypeChange("5-shift")}>Pick 5-shift</button>
    </div>
  ),
}));

vi.mock("@/components/schedule/WeekView", () => ({
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

vi.mock("@/components/TransferView", () => ({
  TransferView: ({
    myTeam,
    otherScheduleType,
    onOtherScheduleTypeChange,
  }: {
    myTeam: number | null;
    otherScheduleType?: ScheduleOption | null;
    onOtherScheduleTypeChange?: (next: ScheduleOption | null) => void;
  }) => (
    <div data-testid="transfer-view">
      TransferView - Team {myTeam} - OtherSchedule: {otherScheduleType || "none"}
      <button onClick={() => onOtherScheduleTypeChange?.("9-5")}>Compare with 9-5</button>
    </div>
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
      <HdayHelperProvider>
        <SettingsProvider>
          <EventStoreProvider>{ui}</EventStoreProvider>
        </SettingsProvider>
      </HdayHelperProvider>
    </ToastProvider>,
  );
}

describe("ScheduleTabView", () => {
  describe("View mode rendering", () => {
    it("renders view mode toggle buttons", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      expect(screen.getByRole("button", { name: /Schedule/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Transfers/i })).toBeInTheDocument();
    });

    it("shows the merged schedule view (Today) by default", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);
      expect(screen.getByTestId("today-view")).toBeInTheDocument();
      expect(screen.queryByTestId("transfer-view")).not.toBeInTheDocument();
    });

    it("does not show Week until a schedule is selected", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);
      expect(screen.queryByTestId("schedule-view")).not.toBeInTheDocument();
    });

    it("shows Week alongside Today once a schedule is selected", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Pick 5-shift/i }));

      expect(screen.getByTestId("today-view")).toBeInTheDocument();
      expect(screen.getByTestId("schedule-view")).toBeInTheDocument();
    });
  });

  describe("View mode switching", () => {
    it("switches to Transfer view when Transfers button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const transferButton = screen.getByRole("button", { name: /Transfers/i });
      await user.click(transferButton);

      expect(screen.getByTestId("transfer-view")).toBeInTheDocument();
      expect(screen.queryByTestId("today-view")).not.toBeInTheDocument();
      expect(screen.queryByTestId("schedule-view")).not.toBeInTheDocument();
    });

    it("switches back to the schedule view when its button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const transferButton = screen.getByRole("button", { name: /Transfers/i });
      await user.click(transferButton);
      expect(screen.getByTestId("transfer-view")).toBeInTheDocument();

      const scheduleButton = screen.getByRole("button", { name: /Schedule/i });
      await user.click(scheduleButton);
      expect(screen.getByTestId("today-view")).toBeInTheDocument();
      expect(screen.queryByTestId("transfer-view")).not.toBeInTheDocument();
    });

    it("shares the viewing schedule between the schedule view and Transfers (#1110, #1111)", async () => {
      // Regression test for #1110/#1111: the selector used to stay mounted on
      // the Transfers tab while TransferView silently ignored it. Now each
      // view owns its own selector (rendered by TodayView / TransferView),
      // but they read and write the same underlying "viewing schedule" state.
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      await user.click(screen.getByRole("button", { name: /Pick 5-shift/i }));
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 5-shift");

      const transferButton = screen.getByRole("button", { name: /Transfers/i });
      await user.click(transferButton);
      expect(screen.getByTestId("transfer-view")).toHaveTextContent("OtherSchedule: 5-shift");

      await user.click(screen.getByRole("button", { name: /Compare with 9-5/i }));
      expect(screen.getByTestId("transfer-view")).toHaveTextContent("OtherSchedule: 9-5");

      const scheduleButton = screen.getByRole("button", { name: /Schedule/i });
      await user.click(scheduleButton);
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 9-5");
    });
  });

  describe("Props passing", () => {
    it("passes myTeam prop to TodayView", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} myTeam={3} />);
      expect(screen.getByTestId("today-view")).toHaveTextContent("Team 3");
    });

    it("passes myTeam prop to WeekView", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} myTeam={3} />);

      await user.click(screen.getByRole("button", { name: /Pick 5-shift/i }));

      expect(screen.getByTestId("schedule-view")).toHaveTextContent("Team 3");
    });
  });

  describe("Schedule selection", () => {
    it("syncs the schedule view when the user's schedule changes", async () => {
      // This test validates that the schedule automatically updates when the user's
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
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: false,
          },
          lastUsed: {
            activeTab: "calendar",
            scheduleView: "schedule",
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
          <HdayHelperProvider>
            <SettingsProvider>
              <EventStoreProvider>
                <TestWrapper />
              </EventStoreProvider>
            </SettingsProvider>
          </HdayHelperProvider>
        </ToastProvider>,
      );

      // Initial state: schedule is "9-5"
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 9-5");

      // Simulate onboarding completion by changing the schedule while component is mounted
      await act(async () => {
        triggerScheduleChange?.();
      });

      // TodayView should now show "5-shift" to match the user's schedule
      expect(screen.getByTestId("today-view")).toHaveTextContent("Schedule: 5-shift");

      // Cleanup
      window.localStorage.removeItem("worktime_user_state");
    });
  });
});
