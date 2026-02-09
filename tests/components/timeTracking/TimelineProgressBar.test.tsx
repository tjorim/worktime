import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TimelineProgressBar } from "../../../src/components/timeTracking/TimelineProgressBar";
import type { TimeTrackingLabel } from "../../../src/components/timeTracking/constants";
import type { StoredTimeTrackingTask } from "../../../src/components/timeTracking/types";
import { dayjs } from "../../../src/utils/dateTimeUtils";

describe("TimelineProgressBar Component", () => {
  const mockLabels: TimeTrackingLabel[] = [
    { id: "label-1", name: "Development", color: "#007bff" },
    { id: "label-2", name: "Meeting", color: "#28a745" },
    { id: "label-3", name: "Documentation", color: "#ffc107" },
  ];

  describe("Basic Rendering", () => {
    it("renders with no tasks", () => {
      const { container } = render(<TimelineProgressBar tasks={[]} labels={mockLabels} />);

      expect(container.textContent).toContain("0.00h");
      expect(container.textContent).toContain("0.0%");
    });

    it("renders summary text with hours and percentage", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Dev work",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T13:00",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      expect(container.textContent).toContain("4.00h");
      expect(container.textContent).toContain("47.1%");
    });

    it("displays overtime badge when exceeding target", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Long day",
          label: "label-1",
          startTime: "2025-01-06T08:00",
          stopTime: "2025-01-06T19:00",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      expect(container.textContent).toContain("11.00h");
      expect(screen.getByText(/Overtime:/)).toBeInTheDocument();
      expect(container.textContent).toContain("+2.50h");
    });
  });

  describe("Timeline Segments", () => {
    it("renders multiple task segments in order", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Morning dev",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T11:00",
        },
        {
          id: "task-2",
          text: "Meeting",
          label: "label-2",
          startTime: "2025-01-06T11:00",
          stopTime: "2025-01-06T12:00",
        },
        {
          id: "task-3",
          text: "Documentation",
          label: "label-3",
          startTime: "2025-01-06T12:00",
          stopTime: "2025-01-06T15:00",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      // Check that all task names appear in the timeline
      expect(container.textContent).toContain("Morning dev");
      expect(container.textContent).toContain("Meeting");
      expect(container.textContent).toContain("Documentation");
    });

    it("applies correct label colors to segments", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Dev work",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T13:00",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      const segment = container.querySelector('[title*="Dev work"]');
      expect(segment).toHaveStyle({ backgroundColor: "#007bff" });
    });

    it("uses default gray color for unknown labels", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Unknown task",
          label: "unknown-label",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T13:00",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      const segment = container.querySelector('[title*="Unknown task"]');
      expect(segment).toHaveStyle({ backgroundColor: "#6c757d" });
    });

    it("includes task duration in segment title", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Dev work",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T13:30",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      const segment = container.querySelector('[title*="Dev work"]');
      expect(segment).toHaveAttribute("title", "Dev work: 4.50h");
    });
  });

  describe("Running Tasks", () => {
    it("handles running task with live time", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Current work",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          // No stopTime - task is running
        },
      ];

      const liveTime = dayjs("2025-01-06T11:30");
      const { container } = render(
        <TimelineProgressBar tasks={tasks} labels={mockLabels} liveTime={liveTime} />,
      );

      // 2.5 hours elapsed
      expect(container.textContent).toContain("2.50h");
      expect(container.textContent).toContain("29.4%");
    });

    it("updates duration when liveTime changes", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Current work",
          label: "label-1",
          startTime: "2025-01-06T09:00",
        },
      ];

      const liveTime1 = dayjs("2025-01-06T10:00");
      const { container, rerender } = render(
        <TimelineProgressBar tasks={tasks} labels={mockLabels} liveTime={liveTime1} />,
      );

      expect(container.textContent).toContain("1.00h");

      const liveTime2 = dayjs("2025-01-06T12:00");
      rerender(<TimelineProgressBar tasks={tasks} labels={mockLabels} liveTime={liveTime2} />);

      expect(container.textContent).toContain("3.00h");
    });
  });

  describe("Target Hours Guideline", () => {
    it("displays target hours guideline at 100%", () => {
      const { container } = render(
        <TimelineProgressBar tasks={[]} labels={mockLabels} targetHours={8.5} />,
      );

      const guideline = container.querySelector('[title*="Target:"]');
      expect(guideline).toBeInTheDocument();
      expect(guideline).toHaveAttribute("title", "Target: 8.5h");
    });

    it("respects custom target hours", () => {
      const { container } = render(
        <TimelineProgressBar tasks={[]} labels={mockLabels} targetHours={7.5} />,
      );

      const guideline = container.querySelector('[title*="Target:"]');
      expect(guideline).toHaveAttribute("title", "Target: 7.5h");
    });

    it("uses default target of 8.5h when not specified", () => {
      const { container } = render(<TimelineProgressBar tasks={[]} labels={mockLabels} />);

      const guideline = container.querySelector('[title*="Target:"]');
      expect(guideline).toHaveAttribute("title", "Target: 8.5h");
    });
  });

  describe("Segment Positioning", () => {
    it("positions segments sequentially based on duration", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Task 1",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T11:15", // 2.25h = 26.47% of 8.5h
        },
        {
          id: "task-2",
          text: "Task 2",
          label: "label-2",
          startTime: "2025-01-06T11:15",
          stopTime: "2025-01-06T13:30", // 2.25h = 26.47% of 8.5h
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      const segments = container.querySelectorAll(".position-absolute[title*=Task]");
      expect(segments).toHaveLength(2);

      // First segment should start at 0%
      expect(segments[0]).toHaveStyle({ left: "0%" });

      // Second segment should start after first (around 26.47%)
      const secondSegmentLeft = (segments[1] as HTMLElement).style.left;
      expect(parseFloat(secondSegmentLeft)).toBeGreaterThan(25);
      expect(parseFloat(secondSegmentLeft)).toBeLessThan(28);
    });

    it("clamps segments at 100% when overtime", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Very long task",
          label: "label-1",
          startTime: "2025-01-06T08:00",
          stopTime: "2025-01-06T20:00", // 12 hours = 141% of 8.5h
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      const segment = container.querySelector('[title*="Very long task"]');
      // Width should be clamped to 100%
      expect(segment).toHaveStyle({ width: "100%" });
    });
  });

  describe("Visual States", () => {
    it("hides text in narrow segments", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Short task",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T09:30", // 0.5h = ~5.9% width (< 10% threshold)
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      const segment = container.querySelector('[title*="Short task"]');
      // Segment exists but text should not be visible
      expect(segment).toBeInTheDocument();
      expect(segment?.textContent?.trim()).toBe("");
    });

    it("shows text in wide segments", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Long task",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T13:00", // 4h = ~47% width (> 10% threshold)
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      const segment = container.querySelector('[title*="Long task"]');
      expect(segment?.textContent).toContain("Long task");
    });
  });

  describe("Edge Cases", () => {
    it("handles zero duration tasks", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Zero duration",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T09:00",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      expect(container.textContent).toContain("0.00h");
      expect(container.textContent).toContain("0.0%");
    });

    it("handles negative duration gracefully", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Invalid task",
          label: "label-1",
          startTime: "2025-01-06T13:00",
          stopTime: "2025-01-06T09:00", // Stop before start
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      // Should clamp to 0 hours
      expect(container.textContent).toContain("0.00h");
    });

    it("handles invalid target hours", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Task",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T13:00",
        },
      ];

      const { container } = render(
        <TimelineProgressBar tasks={tasks} labels={mockLabels} targetHours={0} />,
      );

      // Should fall back to default 8.5h
      expect(container.textContent).toContain("4.00h");
      expect(container.textContent).toContain("47.1%");
    });

    it("handles empty labels array", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Task",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T13:00",
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={[]} />);

      // Should use default gray color
      const segment = container.querySelector('[title*="Task"]');
      expect(segment).toHaveStyle({ backgroundColor: "#6c757d" });
    });
  });

  describe("Percentage Calculations", () => {
    it("calculates correct percentage for exact target", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Full day",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T17:30", // 8.5 hours
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      expect(container.textContent).toContain("8.50h");
      expect(container.textContent).toContain("100.0%");
    });

    it("shows correct overtime percentage", () => {
      const tasks: StoredTimeTrackingTask[] = [
        {
          id: "task-1",
          text: "Overtime day",
          label: "label-1",
          startTime: "2025-01-06T09:00",
          stopTime: "2025-01-06T19:45", // 10.75 hours
        },
      ];

      const { container } = render(<TimelineProgressBar tasks={tasks} labels={mockLabels} />);

      expect(container.textContent).toContain("10.75h");
      // 10.75 / 8.5 = 126.47%
      expect(container.textContent).toContain("126.5%");
    });
  });
});
