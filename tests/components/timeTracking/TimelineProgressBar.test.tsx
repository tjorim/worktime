import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimelineProgressBar } from "../../../src/components/timeTracking/TimelineProgressBar";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";
import type { TimeTrackingLabel } from "../../../src/components/timeTracking/constants";

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
      expect(screen.getByLabelText("Break deduction: 30 minutes")).toBeInTheDocument();
      // The work segments should have the task tooltip
      const workSegments = screen.getAllByLabelText(/Morning work: \d+\.\d+h/);
      expect(workSegments.length).toBeGreaterThanOrEqual(1);
    });

    it("does not render break segment for task without break", () => {
      const task = makeTask();

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      expect(screen.queryByLabelText("Break deduction: 30 minutes")).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Morning work: \d+\.\d+h/)).toBeInTheDocument();
    });

    it("applies reduced opacity to break segment", () => {
      const task = makeTask({ includesBreak: true });

      const { container } = render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      const progressBars = container.querySelectorAll(".progress-bar");
      const breakBar = Array.from(progressBars).find(
        (bar) => (bar as HTMLElement).style.opacity === "0.3",
      );
      expect(breakBar).toBeTruthy();
    });

    it("shows break title tooltip on break segment", () => {
      const task = makeTask({ includesBreak: true });

      render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      const breakSegment = screen.getByLabelText("Break deduction: 30 minutes");
      expect(breakSegment).toHaveAttribute("title", "Break: 30min");
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

      const { container } = render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      expect(container.textContent).toContain("7.50h");
    });

    it("shows full hours without break", () => {
      const task = makeTask();

      const { container } = render(<TimelineProgressBar tasks={[task]} labels={TEST_LABELS} />);

      expect(container.textContent).toContain("8.00h");
    });
  });
});
