import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { DailyTimeline } from "../../../src/components/timeTracking/DailyTimeline";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";
import type { TimeTrackingLabel } from "../../../src/components/timeTracking/constants";
import { dayjs } from "../../../src/utils/dateTimeUtils";

const TEST_LABELS: TimeTrackingLabel[] = [
  { id: "dev", name: "Development", color: "#198754" },
  { id: "meeting", name: "Meeting", color: "#0d6efd" },
];

const DATE = "2026-02-07";

function makeTask(overrides: Partial<StoredTimeTrackingTask> = {}): StoredTimeTrackingTask {
  return {
    id: "task-1",
    text: "Deep work",
    label: "dev",
    startTime: `${DATE}T09:00`,
    stopTime: `${DATE}T12:00`,
    ...overrides,
  };
}

describe("DailyTimeline", () => {
  it("renders nothing when there are no tasks", () => {
    const { container } = render(
      <DailyTimeline tasks={[]} labels={TEST_LABELS} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the timeline container when tasks exist", () => {
    render(<DailyTimeline tasks={[makeTask()]} labels={TEST_LABELS} />);
    expect(screen.getByTestId("daily-timeline")).toBeInTheDocument();
  });

  it("renders a bar for each task with aria-label showing name and times", () => {
    const task = makeTask({ text: "Stand-up", startTime: `${DATE}T09:00`, stopTime: `${DATE}T09:30` });
    render(<DailyTimeline tasks={[task]} labels={TEST_LABELS} />);
    expect(screen.getByLabelText("Stand-up: 09:00–09:30")).toBeInTheDocument();
  });

  it("renders bars for multiple tasks", () => {
    const tasks = [
      makeTask({ id: "t1", text: "Task A", startTime: `${DATE}T08:00`, stopTime: `${DATE}T10:00` }),
      makeTask({ id: "t2", text: "Task B", startTime: `${DATE}T11:00`, stopTime: `${DATE}T13:00` }),
    ];
    render(<DailyTimeline tasks={tasks} labels={TEST_LABELS} />);
    expect(screen.getByLabelText("Task A: 08:00–10:00")).toBeInTheDocument();
    expect(screen.getByLabelText("Task B: 11:00–13:00")).toBeInTheDocument();
  });

  it("labels a running task with 'Running' as stop time", () => {
    const task = makeTask({ text: "Active task", stopTime: undefined });
    const liveTime = dayjs(`${DATE}T10:30`);
    render(<DailyTimeline tasks={[task]} labels={TEST_LABELS} liveTime={liveTime} isToday />);
    expect(screen.getByLabelText("Active task: 09:00–Running")).toBeInTheDocument();
  });

  it("does not render the Now line when isToday is false", () => {
    const liveTime = dayjs(`${DATE}T10:00`);
    render(<DailyTimeline tasks={[makeTask()]} labels={TEST_LABELS} liveTime={liveTime} isToday={false} />);
    expect(screen.queryByTestId("timeline-now-line")).not.toBeInTheDocument();
  });

  it("does not render the Now line when liveTime is absent", () => {
    render(<DailyTimeline tasks={[makeTask()]} labels={TEST_LABELS} isToday />);
    expect(screen.queryByTestId("timeline-now-line")).not.toBeInTheDocument();
  });

  it("renders the Now line when isToday and liveTime are provided", () => {
    const liveTime = dayjs(`${DATE}T10:00`);
    render(<DailyTimeline tasks={[makeTask()]} labels={TEST_LABELS} liveTime={liveTime} isToday />);
    expect(screen.getByTestId("timeline-now-line")).toBeInTheDocument();
  });

  it("shows the current time label on the Now line", () => {
    const liveTime = dayjs(`${DATE}T10:30`);
    render(<DailyTimeline tasks={[makeTask()]} labels={TEST_LABELS} liveTime={liveTime} isToday />);
    expect(screen.getByText("10:30")).toBeInTheDocument();
  });

  it("renders hour tick labels on the time axis", () => {
    const task = makeTask({ startTime: `${DATE}T09:00`, stopTime: `${DATE}T11:00` });
    render(<DailyTimeline tasks={[task]} labels={TEST_LABELS} />);
    // The range 09:00–11:00 with 30min padding should show 08:00–12:00 ticks
    expect(screen.getByText("09:00")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("11:00")).toBeInTheDocument();
  });
});
