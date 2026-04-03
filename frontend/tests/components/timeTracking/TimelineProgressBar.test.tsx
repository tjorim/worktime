import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimelineProgressBar } from "../../../src/components/timeTracking/TimelineProgressBar";
import { BREAK_DURATION_MINUTES } from "../../../src/components/timeTracking/timeUtils";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";
import type { TimeTrackingLabel } from "../../../src/components/timeTracking/constants";
import { dayjs } from "../../../src/utils/dateTimeUtils";

const TEST_LABELS: TimeTrackingLabel[] = [{ id: "Support", name: "Support", color: "#c82333" }];

function makeTask(overrides: Partial<StoredTimeTrackingTask> = {}): StoredTimeTrackingTask {
  return {
    id: "task-1",
    text: "Morning work",
    label: "Support",
    startTime: "2026-02-07T08:00",
    stopTime: "2026-02-07T16:00",
    ...overrides,
  };
}

describe("TimelineProgressBar", () => {
  describe("three-segment break rendering", () => {
    it("renders before, break, and after segments for a task with break", () => {
      const task = makeTask({ includesBreak: true });

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      // The break segment should have its own aria-label
      expect(
        screen.getByLabelText(`Break deduction: ${BREAK_DURATION_MINUTES} minutes`),
      ).toBeInTheDocument();
      // The work segments should have the task tooltip
      const workSegments = screen.getAllByLabelText(/Morning work: \d+\.\d+h/);
      expect(workSegments.length).toBeGreaterThanOrEqual(1);
    });

    it("does not render break segment for task without break", () => {
      const task = makeTask();

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      expect(
        screen.queryByLabelText(`Break deduction: ${BREAK_DURATION_MINUTES} minutes`),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Morning work: \d+\.\d+h/)).toBeInTheDocument();
    });

    it("applies reduced opacity to break segment", () => {
      const task = makeTask({ includesBreak: true });

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      const breakBar = screen.getByTestId("break-segment-task-1");
      expect(breakBar).toHaveStyle("opacity: 0.3");
    });

    it("shows break title tooltip on break segment", () => {
      const task = makeTask({ includesBreak: true });

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      const breakSegment = screen.getByLabelText(
        `Break deduction: ${BREAK_DURATION_MINUTES} minutes`,
      );
      expect(breakSegment).toHaveAttribute("title", `Break: ${BREAK_DURATION_MINUTES}min`);
    });
  });

  describe("break legend", () => {
    it("shows legend when tasks include a break", () => {
      const task = makeTask({ includesBreak: true });

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      expect(screen.getByText("Break (30min)")).toBeInTheDocument();
    });

    it("does not show legend when no tasks have breaks", () => {
      const task = makeTask();

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      expect(screen.queryByText("Break (30min)")).not.toBeInTheDocument();
    });
  });

  describe("effective duration with break", () => {
    it("deducts break from displayed hours", () => {
      // 8:00-16:00 = 8 hours raw, 7.5 effective with break
      const task = makeTask({ includesBreak: true });

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      const totalDuration = screen.getByTestId("timeline-total-duration");
      expect(totalDuration).toHaveTextContent("7.50h");
    });

    it("shows full hours without break", () => {
      const task = makeTask();

      const { container } = render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      expect(container.textContent).toContain("8.00h");
    });
  });

  describe("Now line", () => {
    const getNowLineLeft = () => screen.getByTestId("now-line").style.left;

    it("does not render when isToday is false", () => {
      const liveTime = dayjs("2026-02-07T12:00");
      render(
        <TimelineProgressBar
          tasks={[makeTask()]}
          labels={TEST_LABELS}
          liveTime={liveTime}
          isToday={false}
        />,
      );
      expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
    });

    it("does not render when liveTime is absent", () => {
      render(<TimelineProgressBar tasks={[makeTask()]} labels={TEST_LABELS} isToday />);
      expect(screen.queryByTestId("now-line")).not.toBeInTheDocument();
    });

    it("renders when isToday and liveTime are provided", () => {
      const liveTime = dayjs("2026-02-07T12:00");
      render(
        <TimelineProgressBar
          tasks={[makeTask()]}
          labels={TEST_LABELS}
          liveTime={liveTime}
          isToday
        />,
      );
      expect(screen.getByTestId("now-line")).toBeInTheDocument();
    });

    it("has an aria-label showing the current time", () => {
      const liveTime = dayjs("2026-02-07T10:30");
      render(
        <TimelineProgressBar
          tasks={[makeTask()]}
          labels={TEST_LABELS}
          liveTime={liveTime}
          isToday
        />,
      );
      expect(screen.getByLabelText("Current time: 10:30")).toBeInTheDocument();
    });

    it("aligns with rendered segments when there is a gap between tasks", () => {
      const tasksWithGap: StoredTimeTrackingTask[] = [
        makeTask({ id: "task-1", startTime: "2026-02-07T08:00", stopTime: "2026-02-07T10:00" }),
        makeTask({ id: "task-2", startTime: "2026-02-07T12:00", stopTime: "2026-02-07T16:00" }),
      ];

      render(
        <TimelineProgressBar
          tasks={tasksWithGap}
          labels={TEST_LABELS}
          liveTime={dayjs("2026-02-07T11:00")}
          isToday
        />,
      );

      // One 2h segment completed on an 8h target => 25%.
      expect(getNowLineLeft()).toBe("25%");
    });

    it("uses the same overtime compression scale as rendered segments", () => {
      const overtimeTask = makeTask({ stopTime: "2026-02-07T18:00" }); // 10h => compressed to 100%

      render(
        <TimelineProgressBar
          tasks={[overtimeTask]}
          labels={TEST_LABELS}
          liveTime={dayjs("2026-02-07T17:00")}
          isToday
        />,
      );

      // 9h elapsed in a 10h rendered bar => 90% after normalization.
      expect(getNowLineLeft()).toBe("90%");
    });

    it("tracks clock time within break-enabled tasks using the rendered scale", () => {
      const taskWithBreak = makeTask({ includesBreak: true });

      render(
        <TimelineProgressBar
          tasks={[taskWithBreak]}
          labels={TEST_LABELS}
          liveTime={dayjs("2026-02-07T12:30")}
          isToday
        />,
      );

      // 4.5h elapsed from 08:00 to 12:30 on an 8h visual timeline => 56.25%.
      expect(getNowLineLeft()).toBe("56.25%");
    });
  });
});
