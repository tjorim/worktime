import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimeTrackingView } from "@/components/timeTracking/TimeTrackingView";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/contexts/ToastContext";
import type { StoredTimeTrackingTask } from "@/components/timeTracking/types";

const TEST_LABELS = [
  { id: "Development", name: "Development", color: "#198754" },
  { id: "Support", name: "Support", color: "#c82333" },
];

let mockTasks: StoredTimeTrackingTask[] = [];

// Mock the hooks
vi.mock("@/hooks/useTimeTrackingStorage", () => ({
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

      expect(dailyButton).toBeInTheDocument();
      expect(weeklyButton).toBeInTheDocument();
    });

    it("should show daily view by default", () => {
      renderWithSettings();

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
    });

    it("should have icons in view toggle buttons", () => {
      renderWithSettings();

      const dailyButton = screen.getByRole("button", { name: /Daily Log/i });
      const weeklyButton = screen.getByRole("button", { name: /Weekly Summary/i });

      const dailyIcon = dailyButton.querySelector("i");
      const weeklyIcon = weeklyButton.querySelector("i");

      expect(dailyIcon).toHaveClass("bi-list-check");
      expect(weeklyIcon).toHaveClass("bi-bar-chart-line");
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

  describe("Cross-tab entry navigation", () => {
    const renderWithPendingEdit = (
      pendingTaskEditId: string | null,
      onClearPendingTaskEdit = vi.fn(),
    ) =>
      render(
        <SettingsProvider>
          <ToastProvider>
            <TimeTrackingView
              pendingTaskEditId={pendingTaskEditId}
              onClearPendingTaskEdit={onClearPendingTaskEdit}
            />
          </ToastProvider>
        </SettingsProvider>,
      );

    it("switches to daily view, jumps to the entry's date, and opens its edit modal", () => {
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
      mockTasks = [
        {
          id: "task-a",
          text: "Ship feature",
          label: "Development",
          startTime: "2025-01-03T09:00",
          stopTime: "2025-01-03T10:00",
        },
      ];
      const onClearPendingTaskEdit = vi.fn();

      renderWithPendingEdit("task-a", onClearPendingTaskEdit);

      expect(screen.getByText("Daily Time Tracking")).toBeInTheDocument();
      const dialog = screen.getByRole("dialog");
      expect(within(dialog).getByLabelText(/^Task$/i)).toHaveValue("Ship feature");
      expect(onClearPendingTaskEdit).toHaveBeenCalled();
    });

    it("clears the pending request when the entry no longer exists", () => {
      mockTasks = [];
      const onClearPendingTaskEdit = vi.fn();

      renderWithPendingEdit("missing-task", onClearPendingTaskEdit);

      expect(onClearPendingTaskEdit).toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
