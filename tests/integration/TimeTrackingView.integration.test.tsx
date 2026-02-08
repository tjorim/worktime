import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SettingsProvider } from "../../src/contexts/SettingsContext";
import { TimeTrackingView } from "../../src/components/timeTracking/TimeTrackingView";
import type { StoredTimeTrackingTask } from "../../src/components/timeTracking/types";

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
    addTask: vi.fn(),
    updateTaskTimes: vi.fn(),
    removeTask: vi.fn(),
    addTemplate: vi.fn(),
    updateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
    updateLabels: vi.fn(),
    exportData: vi.fn(),
    importData: vi.fn(),
  })),
}));

function renderWithSettings() {
  return render(
    <SettingsProvider>
      <TimeTrackingView />
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

  it("updates Daily Log content when header day navigation changes date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-06T09:00:00Z"));
    mockTasks = [
      {
        id: "today-task",
        text: "Today Task",
        label: "Support",
        startTime: "2025-01-06T09:00Z",
        stopTime: "2025-01-06T10:00Z",
      },
      {
        id: "yesterday-task",
        text: "Yesterday Task",
        label: "Support",
        startTime: "2025-01-05T09:00Z",
        stopTime: "2025-01-05T10:00Z",
      },
    ];

    renderWithSettings();

    expect(screen.getByText("Today Task")).toBeInTheDocument();
    expect(screen.queryByText("Yesterday Task")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Go to previous day/i }));

    expect(screen.queryByText("Today Task")).not.toBeInTheDocument();
    expect(screen.getByText("Yesterday Task")).toBeInTheDocument();
  });

  it("updates Weekly Summary content when header week navigation changes week", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-13T09:00:00Z"));
    mockTasks = [
      {
        id: "current-week-task",
        text: "Current Week",
        label: "Support",
        startTime: "2025-01-13T09:00Z",
        stopTime: "2025-01-13T11:00Z",
      },
      {
        id: "previous-week-task",
        text: "Previous Week",
        label: "Development",
        startTime: "2025-01-06T10:00Z",
        stopTime: "2025-01-06T12:00Z",
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

    expect(screen.getByText("Support: 2.00 hours")).toBeInTheDocument();
    expect(screen.queryByText("Development: 2.00 hours")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Go to previous week/i }));

    expect(screen.queryByText("Support: 2.00 hours")).not.toBeInTheDocument();
    expect(screen.getByText("Development: 2.00 hours")).toBeInTheDocument();
  });
});
