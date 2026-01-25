import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ScheduleTabView } from "../../src/components/ScheduleTabView";
import { EventStoreProvider } from "../../src/contexts/EventStoreContext";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { dayjs } from "../../src/utils/dateTimeUtils";

// Mock the child components
vi.mock("../../src/components/TodayView", () => ({
  TodayView: ({ myTeam }: { myTeam: number | null }) => (
    <div data-testid="today-view">TodayView - Team {myTeam}</div>
  ),
}));

vi.mock("../../src/components/ScheduleView", () => ({
  ScheduleView: ({ myTeam }: { myTeam: number | null }) => (
    <div data-testid="schedule-view">ScheduleView - Team {myTeam}</div>
  ),
}));

const defaultProps = {
  myTeam: 1,
  currentDate: dayjs("2025-01-15"),
  setCurrentDate: vi.fn(),
  isActive: true,
};

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
    });

    it("shows Today view by default", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} />);
      expect(screen.getByTestId("today-view")).toBeInTheDocument();
    });
  });

  describe("View mode switching", () => {
    it("switches to Week view when Week button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

      const weekButton = screen.getByRole("button", { name: /Week/i });
      await user.click(weekButton);

      expect(screen.getByTestId("schedule-view")).toBeInTheDocument();
      expect(screen.queryByTestId("today-view")).not.toBeInTheDocument();
    });

    it("switches back to Today view when Today button is clicked", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} />);

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
  });

  describe("Props passing", () => {
    it("passes myTeam prop to TodayView", () => {
      renderWithProviders(<ScheduleTabView {...defaultProps} myTeam={3} />);
      expect(screen.getByTestId("today-view")).toHaveTextContent("Team 3");
    });

    it("passes myTeam prop to ScheduleView", async () => {
      const user = userEvent.setup();
      renderWithProviders(<ScheduleTabView {...defaultProps} myTeam={3} />);

      const weekButton = screen.getByRole("button", { name: /Week/i });
      await user.click(weekButton);

      expect(screen.getByTestId("schedule-view")).toHaveTextContent("Team 3");
    });
  });
});
