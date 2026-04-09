import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, defaultLastUsed, defaultSettings } from "@/contexts/SettingsContext";

vi.mock(
  "frappe-gantt",
  () => ({
    default: class MockFrappeGantt {
      refresh() {}
      change_view_mode() {}
    },
  }),
  { virtual: true },
);

vi.mock("@/hooks/usePublicHolidays", () => ({
  usePublicHolidays: () => ({
    publicHolidayMap: new Map([
      ["2026-01-01", { name: "New Year's Day", localName: "Nieuwjaarsdag" }],
      ["2026-04-17", { name: "Good Friday", localName: "Goede Vrijdag" }],
    ]),
    loading: false,
    error: null,
  }),
}));

vi.mock("@/components/gantt/GanttChart.tsx", () => ({
  GanttChart: ({
    tasks,
    initialViewMode,
    holidays,
    onTaskClick,
    onViewModeChange,
  }: {
    tasks: Array<{ id: string; name: string }>;
    initialViewMode?: "Day" | "Week" | "Month" | "Year";
    holidays?: string[];
    onTaskClick: (taskId: string) => void;
    onViewModeChange?: (mode: "Day" | "Week" | "Month" | "Year") => void;
  }) => (
    <div>
      <div data-testid="mock-view-mode">{initialViewMode}</div>
      <div data-testid="mock-holidays">{(holidays ?? []).join(",")}</div>
      <button
        type="button"
        data-testid="mock-change-view"
        onClick={() => onViewModeChange?.("Week")}
      >
        Switch to Week
      </button>
      <ul aria-label="Task list">
        {tasks.map((task) => (
          <li key={task.id}>
            <button type="button" onClick={() => onTaskClick(task.id)}>
              {task.name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  ),
}));

import { GanttView } from "@/components/gantt/GanttView";

type MockUserState = {
  hasCompletedOnboarding: boolean;
  myTeam: number | null;
  scheduleType: string | null;
  settings: typeof defaultSettings;
  lastUsed: typeof defaultLastUsed;
};

function createMockUserState(
  overrides: Partial<MockUserState> & {
    settings?: Partial<typeof defaultSettings> & {
      vacationAllowance?: Partial<typeof defaultSettings.vacationAllowance>;
    };
    lastUsed?: Partial<typeof defaultLastUsed>;
  } = {},
): MockUserState {
  const baseState: MockUserState = {
    hasCompletedOnboarding: true,
    myTeam: 1,
    scheduleType: "5-shift",
    settings: {
      ...defaultSettings,
      enableGantt: true,
    },
    lastUsed: {
      ...defaultLastUsed,
      activeTab: "gantt",
    },
  };

  return {
    ...baseState,
    ...overrides,
    settings: {
      ...baseState.settings,
      ...overrides.settings,
      vacationAllowance: {
        ...baseState.settings.vacationAllowance,
        ...overrides.settings?.vacationAllowance,
      },
    },
    lastUsed: {
      ...baseState.lastUsed,
      ...overrides.lastUsed,
    },
  };
}

function renderWithSettings(
  ui: ReactNode,
  userStateOverrides: Parameters<typeof createMockUserState>[0] = {},
) {
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify(createMockUserState(userStateOverrides)),
  );

  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

describe("GanttView", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it('renders the "Add Task" button', () => {
    renderWithSettings(<GanttView />);

    expect(screen.getByRole("button", { name: "Add Task" })).toBeInTheDocument();
  });

  it("opens modal and creates a task", async () => {
    const user = userEvent.setup();
    renderWithSettings(<GanttView />);

    await user.click(screen.getByRole("button", { name: "Add Task" }));
    await user.type(screen.getByLabelText("Name"), "Write tests");
    const dialog = screen.getByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Add Task" }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("list", { name: "Task list" })).getByText("Write tests"),
      ).toBeInTheDocument();
    });
  });

  it("clicking a task opens edit modal with pre-filled data", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "worktime_gantt_tasks",
      JSON.stringify([
        {
          id: "task-1",
          name: "Plan release",
          start: "2026-03-01",
          end: "2026-03-05",
          progress: 40,
        },
      ]),
    );

    renderWithSettings(<GanttView />);

    await user.click(screen.getByRole("button", { name: "Plan release" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Plan release")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Save Changes" })).toBeInTheDocument();
    });
  });

  it("deletes a task from the list", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "worktime_gantt_tasks",
      JSON.stringify([
        {
          id: "task-1",
          name: "Plan release",
          start: "2026-03-01",
          end: "2026-03-05",
          progress: 40,
        },
      ]),
    );

    renderWithSettings(<GanttView />);

    await user.click(screen.getByRole("button", { name: "Plan release" }));
    await user.click(screen.getByRole("button", { name: "Delete Task" }));
    await user.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Plan release" })).not.toBeInTheDocument();
    });
  });

  it("uses Day as initial library view mode and no duplicate top-level mode buttons", () => {
    renderWithSettings(<GanttView />);

    expect(screen.getByTestId("mock-view-mode")).toHaveTextContent("Day");
    expect(screen.queryByRole("button", { name: "Day" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Week" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Month" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Year" })).not.toBeInTheDocument();
  });

  it("passes public holiday dates to GanttChart", () => {
    // Map preserves insertion order, so the joined string is deterministic given the mock above.
    renderWithSettings(<GanttView />);

    expect(screen.getByTestId("mock-holidays")).toHaveTextContent("2026-01-01,2026-04-17");
  });

  it("restores a saved view mode from settings", () => {
    renderWithSettings(<GanttView />, {
      lastUsed: { ganttViewMode: "Month" },
    });

    expect(screen.getByTestId("mock-view-mode")).toHaveTextContent("Month");
  });

  it("persists the view mode when it changes", async () => {
    const user = userEvent.setup();
    renderWithSettings(<GanttView />);

    expect(screen.getByTestId("mock-view-mode")).toHaveTextContent("Day");

    await user.click(screen.getByTestId("mock-change-view"));

    await waitFor(() => {
      const stored = JSON.parse(window.localStorage.getItem("worktime_user_state") ?? "{}") as {
        lastUsed?: { ganttViewMode?: string };
      };
      expect(stored.lastUsed?.ganttViewMode).toBe("Week");
    });
  });
});
