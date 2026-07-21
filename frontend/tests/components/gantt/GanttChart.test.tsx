import { render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GanttChart } from "@/components/gantt/GanttChart";

const mockInstances: MockFrappeGantt[] = [];

class MockFrappeGantt {
  static reset() {
    mockInstances.length = 0;
  }

  options: {
    view_mode?: "Day" | "Week" | "Month" | "Year";
    view_mode_select?: boolean;
    today_button?: boolean;
    holidays?: Record<string, string | string[]>;
    popup?: (ctx: unknown) => void;
    popup_on?: string;
    on_click?: (task: unknown) => void;
    on_date_change?: (task: unknown, start: Date, end: Date) => void;
    on_progress_change?: (task: unknown, progress: number) => void;
  };

  constructor(
    _wrapper: string | Element,
    _tasks: unknown[],
    options: {
      view_mode?: "Day" | "Week" | "Month" | "Year";
      view_mode_select?: boolean;
      today_button?: boolean;
      holidays?: Record<string, string | string[]>;
      popup?: (ctx: unknown) => void;
      popup_on?: string;
      on_click?: (task: unknown) => void;
      on_date_change?: (task: unknown, start: Date, end: Date) => void;
      on_progress_change?: (task: unknown, progress: number) => void;
    },
  ) {
    this.options = options;
    mockInstances.push(this);
  }

  refresh = vi.fn();

  update_task = vi.fn();

  change_view_mode = vi.fn();
}

vi.mock("frappe-gantt", () => ({ default: MockFrappeGantt }), { virtual: true });

describe("GanttChart", () => {
  afterEach(() => {
    MockFrappeGantt.reset();
  });

  it("passes time-off dates to frappe-gantt as a separate holiday color", async () => {
    render(
      <GanttChart
        tasks={[
          { id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 },
        ]}
        holidays={["2026-01-01"]}
        timeOffDates={["2026-03-03"]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    expect(mockInstances[0].options.holidays).toEqual({
      "var(--bs-secondary-bg)": "weekend",
      "var(--bs-warning-bg-subtle)": ["2026-01-01"],
      "var(--wt-gantt-time-off-bg)": ["2026-03-03"],
    });
  });

  it("ignores malformed task payloads from frappe callbacks", async () => {
    const onTaskClick = vi.fn();
    const onDateChange = vi.fn();
    const onProgressChange = vi.fn();

    render(
      <GanttChart
        tasks={[
          { id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 },
        ]}
        initialViewMode="Day"
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
    instance.options.on_date_change?.(null, new Date(2026, 2, 2), new Date(2026, 2, 4));
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
        tasks={[
          { id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 },
        ]}
        initialViewMode="Day"
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
      new Date(2026, 2, 2),
      new Date(2026, 2, 4),
    );
    instance.options.on_progress_change?.({ id: " task-1 " }, 75);

    expect(onTaskClick).toHaveBeenCalledWith("task-1");
    expect(onDateChange).toHaveBeenCalledWith("task-1", "2026-03-02", "2026-03-04");
    expect(onProgressChange).toHaveBeenCalledWith("task-1", 75);
  });

  it("uses library-provided view controls with Day as initial mode", async () => {
    const onTaskClick = vi.fn();
    const onDateChange = vi.fn();
    const onProgressChange = vi.fn();

    render(
      <GanttChart
        tasks={[
          { id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 },
        ]}
        initialViewMode="Day"
        onTaskClick={onTaskClick}
        onDateChange={onDateChange}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    expect(instance.options.view_mode).toBe("Day");
    expect(instance.options.view_mode_select).toBe(true);
    expect(instance.options.today_button).toBe(true);
    expect(instance.options.popup_on).toBe("hover");
  });

  it("popup function sets title, subtitle from notes, and formatted details", async () => {
    render(
      <GanttChart
        tasks={[
          {
            id: "task-1",
            name: "My Task",
            start: "2026-03-01",
            end: "2026-03-05",
            progress: 50,
            notes: "Some notes",
          },
        ]}
        initialViewMode="Day"
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    const setTitle = vi.fn();
    const setSubtitle = vi.fn();
    const setDetails = vi.fn();

    instance.options.popup?.({
      task: {
        id: "task-1",
        name: "My Task",
        progress: 50,
        notes: "Some notes",
        _start: new Date(2026, 2, 1),
        _end: new Date(2026, 2, 5),
        actual_duration: 4,
      },
      set_title: setTitle,
      set_subtitle: setSubtitle,
      set_details: setDetails,
    });

    expect(setTitle).toHaveBeenCalledWith("My Task");
    expect(setSubtitle).toHaveBeenCalledWith("Some notes");
    expect(setDetails).toHaveBeenCalledWith("Mar 1 – Mar 5 · 4 days · 50%");
  });

  it("popup function includes logged time when available for the task", async () => {
    render(
      <GanttChart
        tasks={[
          {
            id: "task-1",
            name: "My Task",
            start: "2026-03-01",
            end: "2026-03-05",
            progress: 50,
          },
        ]}
        initialViewMode="Day"
        loggedMinutesByTaskId={new Map([["task-1", 90]])}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    const setDetails = vi.fn();

    instance.options.popup?.({
      task: {
        id: "task-1",
        name: "My Task",
        progress: 50,
        _start: new Date(2026, 2, 1),
        _end: new Date(2026, 2, 5),
        actual_duration: 4,
      },
      set_title: vi.fn(),
      set_subtitle: vi.fn(),
      set_details: setDetails,
    });

    expect(setDetails).toHaveBeenCalledWith("Mar 1 – Mar 5 · 4 days · 50% · 1 h 30 min logged");
  });

  it("popup function omits logged time when none has been recorded for the task", async () => {
    render(
      <GanttChart
        tasks={[
          { id: "task-1", name: "My Task", start: "2026-03-01", end: "2026-03-05", progress: 50 },
        ]}
        initialViewMode="Day"
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    const setDetails = vi.fn();

    instance.options.popup?.({
      task: {
        id: "task-1",
        name: "My Task",
        progress: 50,
        _start: new Date(2026, 2, 1),
        _end: new Date(2026, 2, 5),
        actual_duration: 4,
      },
      set_title: vi.fn(),
      set_subtitle: vi.fn(),
      set_details: setDetails,
    });

    expect(setDetails).toHaveBeenCalledWith("Mar 1 – Mar 5 · 4 days · 50%");
  });

  it("popup function pluralizes duration details", async () => {
    render(
      <GanttChart
        tasks={[
          { id: "task-1", name: "My Task", start: "2026-03-01", end: "2026-03-02", progress: 50 },
        ]}
        initialViewMode="Day"
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    const setDetails = vi.fn();

    instance.options.popup?.({
      task: {
        id: "task-1",
        name: "My Task",
        progress: 50,
        _start: new Date(2026, 2, 1),
        _end: new Date(2026, 2, 2),
        actual_duration: 1,
      },
      set_title: vi.fn(),
      set_subtitle: vi.fn(),
      set_details: setDetails,
    });

    expect(setDetails).toHaveBeenCalledWith("Mar 1 – Mar 2 · 1 day · 50%");
  });

  it("popup function uses empty string when notes is absent", async () => {
    render(
      <GanttChart
        tasks={[
          { id: "task-2", name: "No Notes", start: "2026-03-01", end: "2026-03-03", progress: 0 },
        ]}
        initialViewMode="Day"
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    const setSubtitle = vi.fn();

    instance.options.popup?.({
      task: { id: "task-2", name: "No Notes", progress: 0 },
      set_title: vi.fn(),
      set_subtitle: setSubtitle,
      set_details: vi.fn(),
    });

    expect(setSubtitle).toHaveBeenCalledWith("");
  });

  it("escapes HTML in popup title and subtitle", async () => {
    render(
      <GanttChart
        tasks={[
          {
            id: "task-3",
            name: '<img src=x onerror=alert("xss")>',
            start: "2026-03-01",
            end: "2026-03-03",
            progress: 0,
            notes: '<script>alert("xss")</script>',
          },
        ]}
        initialViewMode="Day"
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;
    const setTitle = vi.fn();
    const setSubtitle = vi.fn();

    instance.options.popup?.({
      task: {
        id: "task-3",
        name: '<img src=x onerror=alert("xss")>',
        progress: 0,
        notes: '<script>alert("xss")</script>',
      },
      set_title: setTitle,
      set_subtitle: setSubtitle,
      set_details: vi.fn(),
    });

    expect(setTitle).toHaveBeenCalledWith("&lt;img src=x onerror=alert(&quot;xss&quot;)&gt;");
    expect(setSubtitle).toHaveBeenCalledWith("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
  });

  it("forwards valid task ids from frappe callbacks", async () => {
    const onTaskClick = vi.fn();
    const onDateChange = vi.fn();
    const onProgressChange = vi.fn();

    render(
      <GanttChart
        tasks={[
          { id: "task-1", name: "Task", start: "2026-03-01", end: "2026-03-03", progress: 0 },
        ]}
        initialViewMode="Week"
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
    instance.options.on_date_change?.({ id: "task-1" }, new Date(2026, 2, 2), new Date(2026, 2, 4));
    instance.options.on_progress_change?.({ id: "task-1" }, 75);

    expect(onTaskClick).toHaveBeenCalledWith("task-1");
    expect(onDateChange).toHaveBeenCalledWith("task-1", "2026-03-02", "2026-03-04");
    expect(onProgressChange).toHaveBeenCalledWith("task-1", 75);
  });

  it("calls update_task when only one task's dates change", async () => {
    const task = {
      id: "task-1",
      name: "Task",
      start: "2026-03-01",
      end: "2026-03-03",
      progress: 0,
    };

    const { rerender } = render(
      <GanttChart
        tasks={[task]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    rerender(
      <GanttChart
        tasks={[{ ...task, start: "2026-03-02", end: "2026-03-05" }]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(instance.update_task).toHaveBeenCalledTimes(1);
      expect(instance.update_task).toHaveBeenCalledWith("task-1", {
        start: "2026-03-02",
        end: "2026-03-05",
        progress: 0,
      });
    });

    expect(instance.refresh).not.toHaveBeenCalled();
  });

  it("calls update_task when only one task's progress changes", async () => {
    const task = {
      id: "task-1",
      name: "Task",
      start: "2026-03-01",
      end: "2026-03-03",
      progress: 0,
    };

    const { rerender } = render(
      <GanttChart
        tasks={[task]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    rerender(
      <GanttChart
        tasks={[{ ...task, progress: 50 }]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(instance.update_task).toHaveBeenCalledTimes(1);
      expect(instance.update_task).toHaveBeenCalledWith("task-1", {
        start: "2026-03-01",
        end: "2026-03-03",
        progress: 50,
      });
    });

    expect(instance.refresh).not.toHaveBeenCalled();
  });

  it("calls refresh when a task is added", async () => {
    const task1 = {
      id: "task-1",
      name: "Task 1",
      start: "2026-03-01",
      end: "2026-03-03",
      progress: 0,
    };
    const task2 = {
      id: "task-2",
      name: "Task 2",
      start: "2026-03-04",
      end: "2026-03-06",
      progress: 0,
    };

    const { rerender } = render(
      <GanttChart
        tasks={[task1]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    rerender(
      <GanttChart
        tasks={[task1, task2]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(instance.refresh).toHaveBeenCalledWith([task1, task2]);
    });

    expect(instance.update_task).not.toHaveBeenCalled();
  });

  it("calls refresh when multiple tasks change simultaneously", async () => {
    const task1 = {
      id: "task-1",
      name: "Task 1",
      start: "2026-03-01",
      end: "2026-03-03",
      progress: 0,
    };
    const task2 = {
      id: "task-2",
      name: "Task 2",
      start: "2026-03-04",
      end: "2026-03-06",
      progress: 0,
    };

    const { rerender } = render(
      <GanttChart
        tasks={[task1, task2]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    rerender(
      <GanttChart
        tasks={[
          { ...task1, progress: 25 },
          { ...task2, progress: 75 },
        ]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(instance.refresh).toHaveBeenCalled();
    });

    expect(instance.update_task).not.toHaveBeenCalled();
  });

  it("does not refresh when tasks are unchanged on rerender", async () => {
    const taskA = {
      id: "task-a",
      name: "Task A",
      start: "2026-03-01",
      end: "2026-03-03",
      progress: 0,
    };
    const taskB = {
      id: "task-b",
      name: "Task B",
      start: "2026-03-04",
      end: "2026-03-06",
      progress: 0,
    };

    const { rerender } = render(
      <GanttChart
        tasks={[taskA, taskB]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    rerender(
      <GanttChart
        tasks={[{ ...taskA }, { ...taskB }]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(instance.refresh).not.toHaveBeenCalled();
      expect(instance.update_task).not.toHaveBeenCalled();
    });
  });

  it("calls refresh when same-length IDs are swapped", async () => {
    const taskA = {
      id: "task-a",
      name: "Task A",
      start: "2026-03-01",
      end: "2026-03-03",
      progress: 0,
    };
    const taskB = {
      id: "task-b",
      name: "Task B",
      start: "2026-03-04",
      end: "2026-03-06",
      progress: 0,
    };

    const { rerender } = render(
      <GanttChart
        tasks={[taskA, taskB]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockInstances).toHaveLength(1);
    });

    const [instance] = mockInstances;

    rerender(
      <GanttChart
        tasks={[{ ...taskB }, { ...taskA }]}
        onTaskClick={vi.fn()}
        onDateChange={vi.fn()}
        onProgressChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(instance.refresh).toHaveBeenCalledWith([{ ...taskB }, { ...taskA }]);
    });

    expect(instance.update_task).not.toHaveBeenCalled();
  });
});
