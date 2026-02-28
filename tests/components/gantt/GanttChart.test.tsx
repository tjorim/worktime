import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GanttChart } from "../../../src/components/gantt/GanttChart";

const mockInstances: MockFrappeGantt[] = [];

class MockFrappeGantt {
  static reset() {
    mockInstances.length = 0;
  }

  options: {
    on_click?: (task: unknown) => void;
    on_date_change?: (task: unknown, start: Date, end: Date) => void;
    on_progress_change?: (task: unknown, progress: number) => void;
  };

  constructor(
    _wrapper: string | Element,
    _tasks: unknown[],
    options: {
      on_click?: (task: unknown) => void;
      on_date_change?: (task: unknown, start: Date, end: Date) => void;
      on_progress_change?: (task: unknown, progress: number) => void;
    },
  ) {
    this.options = options;
    mockInstances.push(this);
  }

  refresh = vi.fn();

  change_view_mode = vi.fn();
}

vi.mock("frappe-gantt", () => ({ default: MockFrappeGantt }), { virtual: true });

describe("GanttChart", () => {
  afterEach(() => {
    MockFrappeGantt.reset();
  });

  it("ignores malformed task payloads from frappe callbacks", async () => {
    const onTaskClick = vi.fn();
    const onDateChange = vi.fn();
    const onProgressChange = vi.fn();

    render(
      <GanttChart
        tasks={[{ id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 }]}
        viewMode="Week"
        onTaskClick={onTaskClick}
        onDateChange={onDateChange}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    instance.options.on_click?.(undefined);
    instance.options.on_date_change?.(null, new Date("2026-03-02"), new Date("2026-03-04"));
    instance.options.on_progress_change?.({ id: "" }, 50);

    expect(onTaskClick).not.toHaveBeenCalled();
    expect(onDateChange).not.toHaveBeenCalled();
    expect(onProgressChange).not.toHaveBeenCalled();
  });


  it("trims surrounding whitespace from callback task ids", async () => {
    const onTaskClick = vi.fn();
    const onDateChange = vi.fn();
    const onProgressChange = vi.fn();

    render(
      <GanttChart
        tasks={[{ id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 }]}
        viewMode="Week"
        onTaskClick={onTaskClick}
        onDateChange={onDateChange}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    instance.options.on_click?.({ id: " task-1 " });
    instance.options.on_date_change?.(
      { id: " task-1 " },
      new Date("2026-03-02"),
      new Date("2026-03-04"),
    );
    instance.options.on_progress_change?.({ id: " task-1 " }, 75);

    expect(onTaskClick).toHaveBeenCalledWith("task-1");
    expect(onDateChange).toHaveBeenCalledWith("task-1", "2026-03-02", "2026-03-04");
    expect(onProgressChange).toHaveBeenCalledWith("task-1", 75);
  });


  it("keeps horizontal position when changing view mode", async () => {
    const onTaskClick = vi.fn();
    const onDateChange = vi.fn();
    const onProgressChange = vi.fn();

    const { rerender } = render(
      <GanttChart
        tasks={[{ id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 }]}
        viewMode="Week"
        onTaskClick={onTaskClick}
        onDateChange={onDateChange}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    instance.change_view_mode.mockClear();

    rerender(
      <GanttChart
        tasks={[{ id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 }]}
        viewMode="Month"
        onTaskClick={onTaskClick}
        onDateChange={onDateChange}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => {
      expect(instance.change_view_mode).toHaveBeenCalledWith("Month", true);
    });
  });

  it("forwards valid task ids from frappe callbacks", async () => {
    const onTaskClick = vi.fn();
    const onDateChange = vi.fn();
    const onProgressChange = vi.fn();

    render(
      <GanttChart
        tasks={[{ id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 }]}
        viewMode="Week"
        onTaskClick={onTaskClick}
        onDateChange={onDateChange}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    instance.options.on_click?.({ id: "task-1" });
    instance.options.on_date_change?.(
      { id: "task-1" },
      new Date("2026-03-02"),
      new Date("2026-03-04"),
    );
    instance.options.on_progress_change?.({ id: "task-1" }, 75);

    expect(onTaskClick).toHaveBeenCalledWith("task-1");
    expect(onDateChange).toHaveBeenCalledWith("task-1", "2026-03-02", "2026-03-04");
    expect(onProgressChange).toHaveBeenCalledWith("task-1", 75);
  });
});
