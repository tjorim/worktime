import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { MainTabs } from "@/components/MainTabs";
import { dayjs } from "@/utils/dateTimeUtils";
import { TestProviders } from "../utils/testProviders";

// Mock the child components
vi.mock("@/components/ScheduleTabView", () => ({
  ScheduleTabView: ({ myTeam }: { myTeam: number | null }) => (
    <div data-testid="schedule-tab-view">ScheduleTabView - Team {myTeam}</div>
  ),
}));

const defaultProps = {
  myTeam: 1,
  currentDate: dayjs("2025-01-15"),
  setCurrentDate: vi.fn(),
  activeTab: "schedule",
  onTabChange: vi.fn(),
};

function renderWithProviders(ui: React.ReactElement) {
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      hasCompletedOnboarding: true,
      myTeam: 1,
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
    }),
  );
  return render(<TestProviders>{ui}</TestProviders>);
}

function wrapWithTestProviders(ui: React.ReactElement) {
  return <TestProviders>{ui}</TestProviders>;
}

describe("MainTabs", () => {
  describe("Tab rendering", () => {
    it("renders all tab buttons", () => {
      renderWithProviders(<MainTabs {...defaultProps} />);

      expect(screen.getByRole("tab", { name: "Schedule" })).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Transfers" })).not.toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Time Off" })).toBeInTheDocument();
    });

    it("shows Schedule tab content by default", () => {
      renderWithProviders(<MainTabs {...defaultProps} />);
      expect(screen.getByTestId("schedule-tab-view")).toBeInTheDocument();
    });

    it("shows correct tab content based on activeTab prop", () => {
      renderWithProviders(<MainTabs {...defaultProps} activeTab="schedule" />);
      expect(screen.getByTestId("schedule-tab-view")).toBeInTheDocument();
    });
  });

  describe("Tab navigation", () => {
    it("switches to Time Off tab when clicked", async () => {
      const user = userEvent.setup();
      const mockOnTabChange = vi.fn();

      renderWithProviders(<MainTabs {...defaultProps} onTabChange={mockOnTabChange} />);

      const timeOffTab = screen.getByRole("tab", { name: "Time Off" });
      await user.click(timeOffTab);

      expect(mockOnTabChange).toHaveBeenCalledWith("timeoff");
    });
  });

  describe("Props synchronization", () => {
    it("updates active tab when activeTab prop changes", () => {
      const { rerender } = renderWithProviders(<MainTabs {...defaultProps} activeTab="schedule" />);
      expect(screen.getByTestId("schedule-tab-view")).toBeInTheDocument();

      rerender(wrapWithTestProviders(<MainTabs {...defaultProps} activeTab="timeoff" />));
      expect(screen.getByRole("tab", { name: "Time Off" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    });
  });
});
