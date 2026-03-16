import { describe, it, expect, beforeEach, afterEach, vi } from "vite-plus/test";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimeTrackingView } from "../../../src/components/timeTracking/TimeTrackingView";
import { SettingsProvider } from "../../../src/contexts/SettingsContext";
import { ToastProvider } from "../../../src/contexts/ToastContext";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";

const TEST_LABELS = [
  { id: "Development", name: "Development", color: "#198754" },
  { id: "Support", name: "Support", color: "#c82333" },
];

let mockTasks: StoredTimeTrackingTask[] = [];

// Mock the hooks
vi.mock("../../../src/hooks/useTimeTrackingStorage", () => ({
  useTimeTrackingStorage: vi.fn(() => ({
    tasks: mockTasks,
    templates: [],
    labels: TEST_LABELS,
    addTask: vi.fn(),
    updateTaskTimes: vi.fn(),
    removeTask: vi.fn(),
    addTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    updateTemplates: vi.fn(),
    updateLabels: vi.fn(),
  })),
}));

describe("TimeTrackingView", () => {
  beforeEach(() => {
    localStorage.clear();
    mockTasks = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderWithSettings = () =>
    render(
      <SettingsProvider>
        <ToastProvider>
          <TimeTrackingView />
        </ToastProvider>
      </SettingsProvider>,
    );

  describe("View Toggle", () => {
    it("should render view toggle buttons", () => {
      renderWithSettings();

      const dailyButton = screen.getByRole("button", { name: /Daily Log/i });
      const weeklyButton = screen.getByRole("button", { name: /Weekly Summary/i });
      const configButton = screen.getByRole("button", { name: /Config/i });

      expect(dailyButton).toBeInTheDocument();
      expect(weeklyButton).toBeInTheDocument();
      expect(configButton).toBeInTheDocument();
    });

    it("should show daily view by default", () => {
      renderWithSettings();

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
    });

    it("should have icons in view toggle buttons", () => {
      renderWithSettings();

      const dailyButton = screen.getByRole("button", { name: /Daily Log/i });
      const weeklyButton = screen.getByRole("button", { name: /Weekly Summary/i });
      const configButton = screen.getByRole("button", { name: /Config/i });

      const dailyIcon = dailyButton.querySelector("i");
      const weeklyIcon = weeklyButton.querySelector("i");
      const configIcon = configButton.querySelector("i");

      expect(dailyIcon).toHaveClass("bi-list-check");
      expect(weeklyIcon).toHaveClass("bi-bar-chart-line");
      expect(configIcon).toHaveClass("bi-gear");
    });
  });

  describe("Daily View", () => {
    it("should render TimeTrackingDailyView in daily view", () => {
      renderWithSettings();

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
      expect(screen.getByLabelText(/Jump to date/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Go to previous day/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Go to today$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Go to next day/i })).toBeInTheDocument();
    });
  });

  describe("Weekly View", () => {
    it("should render TimeTrackingWeeklyView when weekly view is selected", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 2,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: true,
          },
          lastUsed: {
            activeTab: "timetracking",
            scheduleView: "today",
            otherSchedule: null,
            timeOffView: "table",
            timeTrackingView: "weekly",
            otherTeam: null,
          },
        }),
      );

      renderWithSettings();

      expect(screen.getByText("Weekly Overview")).toBeInTheDocument();
      expect(screen.getByLabelText(/Jump to date/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Go to previous week/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Go to current week/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Go to next week/i })).toBeInTheDocument();
    });
  });

  describe("Config View", () => {
    it("should render configuration panel when config view is selected", () => {
      window.localStorage.setItem(
        "worktime_user_state",
        JSON.stringify({
          version: 2,
          hasCompletedOnboarding: true,
          myTeam: null,
          scheduleType: "9-5",
          settings: {
            timeFormat: "24h",
            theme: "auto",
            notifications: "off",
            vacationAllowance: { yearlyAmounts: {}, unit: "days", hoursPerDay: 8 },
            enableTimeOff: false,
            enableTimeTracking: true,
          },
          lastUsed: {
            activeTab: "timetracking",
            scheduleView: "today",
            otherSchedule: null,
            timeOffView: "table",
            timeTrackingView: "config",
            otherTeam: null,
          },
        }),
      );

      renderWithSettings();

      expect(screen.getByText("Time Tracking Configuration")).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("should have aria-label on button group", () => {
      renderWithSettings();

      const buttonGroup = screen.getByRole("group", { name: /Toggle time tracking view/i });
      expect(buttonGroup).toBeInTheDocument();
    });

    it("should use semantic Card structure", () => {
      const { container } = renderWithSettings();

      const card = container.querySelector(".card");
      expect(card).toBeInTheDocument();
    });

    it("should have proper card header structure", () => {
      renderWithSettings();

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
    });
  });

  describe("Layout", () => {
    it("should have flex layout with gap", () => {
      const { container } = renderWithSettings();

      const viewContainer = container.querySelector(".time-tracking-view");
      expect(viewContainer).toHaveClass("d-flex", "flex-column", "gap-3");
    });

    it("should render buttons in a ButtonGroup", () => {
      renderWithSettings();

      const buttonGroup = screen.getByRole("group", { name: /Toggle time tracking view/i });
      expect(buttonGroup).toBeInTheDocument();
    });
  });
});
