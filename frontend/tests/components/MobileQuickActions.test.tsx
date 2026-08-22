import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MobileQuickActions } from "@/components/MobileQuickActions";
import { TestProviders } from "@tests/utils/testProviders";

const { mockAddTask, mockUpdateTaskTimes, mockSwitchRunningTask, mockStorage } = vi.hoisted(() => ({
  mockAddTask: vi.fn().mockResolvedValue(true),
  mockUpdateTaskTimes: vi.fn(),
  mockSwitchRunningTask: vi.fn().mockReturnValue(true),
  mockStorage: {
    tasks: [] as Array<{
      id: string;
      text: string;
      label: string;
      startTime: string;
      stopTime?: string;
    }>,
  },
}));

vi.mock("@/hooks/useTimeTrackingStorage", () => ({
  useTimeTrackingStorage: () => ({
    tasks: mockStorage.tasks,
    labels: [{ id: "support", name: "Support", color: "#0d6efd" }],
    addTask: mockAddTask,
    updateTaskTimes: mockUpdateTaskTimes,
    switchRunningTask: mockSwitchRunningTask,
  }),
}));

describe("MobileQuickActions", () => {
  beforeEach(() => {
    mockAddTask.mockClear();
    mockUpdateTaskTimes.mockClear();
    mockSwitchRunningTask.mockClear();
    mockStorage.tasks = [];
    vi.useRealTimers();
  });

  it("starts a timer directly from the quick sheet", async () => {
    const user = userEvent.setup();
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));
    await user.type(screen.getByRole("textbox", { name: "Task" }), "Customer support");
    await user.click(screen.getByRole("button", { name: "Start Now" }));

    expect(mockAddTask).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Customer support", label: "support" }),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens an accessible dialog and runs an action", async () => {
    const user = userEvent.setup();
    const onAddTimeOff = vi.fn();
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={onAddTimeOff}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    const trigger = screen.getByRole("button", { name: "Open quick actions" });
    await user.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(screen.getByRole("button", { name: "Add time off" }));

    expect(onAddTimeOff).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows a running timer and lets the user stop it", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-22T10:00:00"));
    mockStorage.tasks = [
      { id: "running", text: "Customer support", label: "support", startTime: "2026-08-22T09:00" },
    ];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));
    expect(screen.getByText("Customer support")).toBeInTheDocument();
    expect(screen.getByText(/01:00:00/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Stop Timer" }));

    expect(mockUpdateTaskTimes).toHaveBeenCalledWith(
      expect.objectContaining({ id: "running", newStopTime: "2026-08-22T10:00" }),
    );
  });

  it("switches directly from the running timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-22T10:00:00"));
    mockStorage.tasks = [
      { id: "running", text: "First task", label: "support", startTime: "2026-08-22T09:00" },
    ];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));
    await user.click(screen.getByRole("button", { name: "Switch" }));
    await user.type(screen.getByRole("textbox", { name: "Task" }), "Second task");
    await user.click(screen.getByRole("button", { name: "Switch now" }));

    expect(mockSwitchRunningTask).toHaveBeenCalledWith(
      expect.objectContaining({
        runningTaskId: "running",
        nextTask: expect.objectContaining({ text: "Second task", label: "support" }),
      }),
    );
  });

  it("disables quick start when a planned task begins while the sheet is open", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-22T10:00:00"));
    mockStorage.tasks = [
      {
        id: "planned",
        text: "Planned task",
        label: "support",
        startTime: "2026-08-22T10:01",
        stopTime: "2026-08-22T11:00",
      },
    ];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));
    await vi.advanceTimersByTimeAsync(60_000);

    expect(screen.getByRole("button", { name: "Start Now" })).toBeDisabled();
    expect(mockAddTask).not.toHaveBeenCalled();
  });

  it("enables quick start when the current planned task expires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-08-22T10:59:00"));
    mockStorage.tasks = [
      {
        id: "planned",
        text: "Planned task",
        label: "support",
        startTime: "2026-08-22T10:00",
        stopTime: "2026-08-22T11:00",
      },
    ];
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff
          canTrackTime
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={vi.fn()}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));
    expect(screen.getByRole("button", { name: "Start Now" })).toBeDisabled();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(screen.getByRole("button", { name: "Start Now" })).toBeEnabled();
  });

  it("hides actions that are unavailable", async () => {
    const user = userEvent.setup();
    const onOpenCalendar = vi.fn();
    render(
      <TestProviders>
        <MobileQuickActions
          canAddTimeOff={false}
          canTrackTime={false}
          onAddTimeOff={vi.fn()}
          onTrackTime={vi.fn()}
          onOpenCalendar={onOpenCalendar}
        />
      </TestProviders>,
    );

    await user.click(screen.getByRole("button", { name: "Open quick actions" }));

    expect(screen.queryByRole("button", { name: "Add time off" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Track time & location" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open calendar" }));
    expect(onOpenCalendar).toHaveBeenCalledOnce();
  });
});
