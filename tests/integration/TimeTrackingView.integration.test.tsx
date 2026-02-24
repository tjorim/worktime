import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { ToastProvider } from "../../src/contexts/ToastContext";
import { TimeTrackingView } from "../../src/components/timeTracking/TimeTrackingView";
import type { StoredTimeTrackingTask } from "../../src/components/timeTracking/types";
import { dayjs } from "../../src/utils/dateTimeUtils";

const TEST_LABELS = [
  { id: "Development", name: "Development", color: "#198754" },
  { id: "Support", name: "Support", color: "#c82333" },
];

let mockTasks: StoredTimeTrackingTask[] = [];

vi.mock("../../src/hooks/useTimeTrackingStorage", () => ({
  useTimeTrackingStorage: vi.fn(() => ({
    tasks: mockTasks,
    templates: [],
    labels: TEST_LABELS,
    addTask: vi.fn().mockResolvedValue(true),
    updateTaskTimes: vi.fn(),
    removeTask: vi.fn(),
    addTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    updateTemplates: vi.fn(),
    updateLabels: vi.fn(),
  })),
}));

function renderWithSettings() {
  return render(
    <SettingsProvider>
      <ToastProvider>
        <TimeTrackingView />
      </ToastProvider>
    </SettingsProvider>,
  );
}

describe("TimeTrackingView Integration Tests", () => {
  beforeEach(() => {
    localStorage.clear();
    mockTasks = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Timer Workflow", () => {
    it("shows running task with elapsed time when task is active", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T09:00:00Z"));

      // Set up a running task
      mockTasks = [
        {
          id: "running-task",
          text: "Active Task",
          label: "Development",
          startTime: "2025-01-06T08:30:00Z",
          stopTime: undefined,
        },
      ];

      renderWithSettings();

      // Verify running state is shown (task appears twice: in timer section and in list)
      const runningBadge = screen.getAllByText(/Running/i)[0]; // Get the first Running badge
      expect(runningBadge).toBeInTheDocument();
      const activeTaskElements = screen.getAllByText(/Active Task/i);
      expect(activeTaskElements.length).toBeGreaterThan(0);
      // Format expected start time in local timezone (same as component does)
      const expectedStart = dayjs("2025-01-06T08:30:00Z").format("HH:mm");
      const startTimeElements = screen.getAllByText(new RegExp(expectedStart));
      expect(startTimeElements.length).toBeGreaterThan(0); // Appears in timer and task list
      expect(screen.getByText(/00:30:00/i)).toBeInTheDocument(); // 30 minutes elapsed (only in timer)
    });

    it("prevents starting a second timer when one is already running", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T09:00:00Z"));

      // Set up a running task
      mockTasks = [
        {
          id: "running-task",
          text: "Already Running",
          label: "Support",
          startTime: "2025-01-06T08:30:00Z",
          stopTime: undefined,
        },
      ];

      renderWithSettings();

      // Verify start button is disabled
      const startButton = screen.getByRole("button", { name: /Start Now/i });
      expect(startButton).toBeDisabled();
    });

    it("shows completed tasks in daily log with duration", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T14:00:00Z"));

      // Set up completed tasks
      mockTasks = [
        {
          id: "task-1",
          text: "Morning work",
          label: "Development",
          startTime: "2025-01-06T09:00:00Z",
          stopTime: "2025-01-06T11:00:00Z", // 2 hours
        },
        {
          id: "task-2",
          text: "Afternoon support",
          label: "Support",
          startTime: "2025-01-06T13:00:00Z",
          stopTime: "2025-01-06T14:00:00Z", // 1 hour
        },
      ];

      renderWithSettings();

      // Verify both tasks are shown (tasks appear twice: in timeline and task list)
      expect(screen.getAllByText(/Morning work/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Afternoon support/i).length).toBeGreaterThan(0);

      // Verify total hours (3.00h displayed in progress bar)
      expect(screen.getByText(/3\.00/i)).toBeInTheDocument();
    });
  });

  describe("Weekly Summary Updates", () => {
    it("displays correct weekly totals for multiple tasks across the week", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T09:00:00Z")); // Monday

      // Set up tasks across the week
      mockTasks = [
        {
          id: "mon-dev",
          text: "Monday Dev",
          label: "Development",
          startTime: "2025-01-06T09:00:00Z",
          stopTime: "2025-01-06T11:00:00Z", // 2 hours
        },
        {
          id: "tue-dev",
          text: "Tuesday Dev",
          label: "Development",
          startTime: "2025-01-07T09:00:00Z",
          stopTime: "2025-01-07T13:00:00Z", // 4 hours
        },
        {
          id: "wed-support",
          text: "Wednesday Support",
          label: "Support",
          startTime: "2025-01-08T10:00:00Z",
          stopTime: "2025-01-08T13:00:00Z", // 3 hours
        },
      ];

      // Set view to weekly
      localStorage.setItem(
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

      // Verify weekly summary shows correct totals (now in new format)
      expect(screen.getByText(/6\.00 hours/i)).toBeInTheDocument(); // Development total
      expect(screen.getByText(/3\.00 hours/i)).toBeInTheDocument(); // Support total
      expect(screen.getByText(/9\.00 hours/i)).toBeInTheDocument(); // Week total

      // Verify table shows per-day breakdown
      expect(screen.getByText(/Monday/i)).toBeInTheDocument();
      expect(screen.getByText(/Tuesday/i)).toBeInTheDocument();
      expect(screen.getByText(/Wednesday/i)).toBeInTheDocument();
    });

    it("shows empty state when no tasks exist for the week", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T09:00:00Z"));

      // No tasks
      mockTasks = [];

      // Set view to weekly
      localStorage.setItem(
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

      // Verify empty state (new message)
      expect(screen.getByText(/No Time Tracking Data Yet/i)).toBeInTheDocument();
    });
  });

  describe("View Navigation & Persistence", () => {
    it("switches between daily, weekly, and config views", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T09:00:00Z"));

      renderWithSettings();

      // Should start in daily view (default)
      expect(screen.getByText(/Daily Time Tracking/i)).toBeInTheDocument();

      // Switch to weekly view
      fireEvent.click(screen.getByRole("button", { name: /Weekly Summary/i }));

      // Verify view changed
      expect(screen.getByText(/Weekly Overview/i)).toBeInTheDocument();

      // Switch to config view
      fireEvent.click(screen.getByRole("button", { name: /Config/i }));

      // Verify view changed
      expect(screen.getByText(/Time Tracking Configuration/i)).toBeInTheDocument();

      // Switch back to daily
      fireEvent.click(screen.getByRole("button", { name: /Daily Log/i }));

      // Verify view changed back
      expect(screen.getByText(/Daily Time Tracking/i)).toBeInTheDocument();
    });

    it("restores last used view mode from localStorage on mount", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T09:00:00Z"));

      // Set localStorage to config view
      localStorage.setItem(
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

      // Should start in config view (from localStorage)
      expect(screen.getByText(/Time Tracking Configuration/i)).toBeInTheDocument();
    });
  });

  describe("Day Navigation", () => {
    it("updates Daily Log content when header day navigation changes date", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-06T09:00:00Z"));
      mockTasks = [
        {
          id: "today-task",
          text: "Today Task",
          label: "Support",
          startTime: "2025-01-06T09:00:00Z",
          stopTime: "2025-01-06T10:00:00Z",
        },
        {
          id: "yesterday-task",
          text: "Yesterday Task",
          label: "Support",
          startTime: "2025-01-05T09:00:00Z",
          stopTime: "2025-01-05T10:00:00Z",
        },
      ];

      renderWithSettings();

      // Tasks appear twice: in timeline and task list
      expect(screen.getAllByText("Today Task").length).toBeGreaterThan(0);
      expect(screen.queryByText("Yesterday Task")).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /Go to previous day/i }));

      expect(screen.queryByText("Today Task")).not.toBeInTheDocument();
      // Tasks appear twice: in timeline and task list
      expect(screen.getAllByText("Yesterday Task").length).toBeGreaterThan(0);
    });

    it("updates Weekly Summary content when header week navigation changes week", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-13T09:00:00Z"));
      mockTasks = [
        {
          id: "current-week-task",
          text: "Current Week",
          label: "Support",
          startTime: "2025-01-13T09:00:00Z",
          stopTime: "2025-01-13T11:00:00Z",
        },
        {
          id: "previous-week-task",
          text: "Previous Week",
          label: "Development",
          startTime: "2025-01-06T10:00:00Z",
          stopTime: "2025-01-06T12:00:00Z",
        },
      ];

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

      // Verify weekly summary shows Support in the initial week (new format)
      const hoursElements = screen.getAllByText(/2\.00 hours/i);
      expect(hoursElements.length).toBeGreaterThan(0);
      // Week 3 has Support task (appears in multiple places)
      const supportElements = screen.getAllByText(/Support/i);
      expect(supportElements.length).toBeGreaterThan(0);

      fireEvent.click(screen.getByRole("button", { name: /Go to previous week/i }));

      // After navigating to week 2, we should see Development task
      const hoursElements2 = screen.getAllByText(/2\.00 hours/i);
      expect(hoursElements2.length).toBeGreaterThan(0);
      const devElements = screen.getAllByText(/Development/i);
      expect(devElements.length).toBeGreaterThan(0);
    });
  });
});
