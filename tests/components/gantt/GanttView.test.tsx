import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SettingsProvider, USER_STATE_VERSION } from "../../../src/contexts/SettingsContext";

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

vi.mock("../../../src/hooks/usePublicHolidays", () => ({
  usePublicHolidays: () => ({
    publicHolidayMap: new Map([
      ["2026-01-01", { name: "New Year's Day", localName: "Nieuwjaarsdag" }],
      ["2026-04-17", { name: "Good Friday", localName: "Goede Vrijdag" }],
    ]),
    loading: false,
    error: null,
  }),
}));

vi.mock("../../../src/components/gantt/GanttChart.tsx", () => ({
  GanttChart: ({
    tasks,
    initialViewMode,
    holidays,
    onTaskClick,
  }: {
    tasks: Array<{ id: string; name: string }>;
    initialViewMode?: "Day" | "Week" | "Month" | "Year";
    holidays?: string[];
    onTaskClick: (taskId: string) => void;
  }) => (
    <div>
      <div data-testid="mock-view-mode">{initialViewMode}</div>
      <div data-testid="mock-holidays">{(holidays ?? []).join(",")}</div>
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

import { GanttView } from "../../../src/components/gantt/GanttView";

function renderWithSettings(ui: ReactNode) {
  window.localStorage.setItem(
    "worktime_user_state",
    JSON.stringify({
      version: USER_STATE_VERSION,
      hasCompletedOnboarding: true,
      myTeam: 1,
      scheduleType: "5-shift",
      settings: {
        timeFormat: "24h",
        theme: "auto",
        notifications: "off",
        vacationAllowance: {
          yearlyAmounts: {},
          unit: "days",
          hoursPerDay: 8,
        },
        enableTimeOff: false,
        enableTimeTracking: false,
        enableGantt: true,
        enableCrossBorderTracking: false,
        homeCountry: null,
        officeCountry: null,
      },
      lastUsed: {
        activeTab: "gantt",
        scheduleView: "today",
        otherSchedule: null,
        timeOffView: "table",
        timeTrackingView: "daily",
        otherTeam: null,
      },
    }),
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
    renderWithSettings(<GanttView />);

    expect(screen.getByTestId("mock-holidays")).toHaveTextContent("2026-01-01,2026-04-17");
  });
});
