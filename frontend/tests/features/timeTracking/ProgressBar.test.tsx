import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ProgressBar } from "@/features/timeTracking/ProgressBar";

describe("ProgressBar Component", () => {
  describe("Visual Representation", () => {
    it("displays progress indicator element", () => {
      const { container } = render(<ProgressBar hours={4} />);

      const progressElement = container.querySelector(".progress-bar");
      expect(progressElement).toBeInTheDocument();
    });

    it("calculates percentage based on default target", () => {
      const { container } = render(<ProgressBar hours={4} />);

      // 4 / 8 = 50%
      const progressElement = container.querySelector(".progress-bar");
      expect(progressElement).toHaveStyle({ width: "50%" });
    });

    it("accepts custom target hours parameter", () => {
      const { container } = render(<ProgressBar hours={5} targetHours={10} />);

      // 5 / 10 = 50%
      const progressElement = container.querySelector(".progress-bar");
      expect(progressElement).toHaveStyle({ width: "50%" });
    });

    it("displays formatted hour value with precision", () => {
      const { container } = render(<ProgressBar hours={6.789} />);

      expect(container.textContent).toContain("6.79");
    });

    it("shows percentage value alongside hours", () => {
      const { container } = render(<ProgressBar hours={2.125} targetHours={8.5} />);

      // 2.125 / 8.5 = 25%
      expect(container.textContent).toContain("25.0%");
    });
  });

  describe("Visual Feedback States", () => {
    it("uses success variant when under target", () => {
      const { container } = render(<ProgressBar hours={7} targetHours={8.5} />);

      const progressElement = container.querySelector(".progress-bar");
      expect(progressElement).toHaveClass("bg-success");
    });

    it("uses success variant when exactly at target", () => {
      const { container } = render(<ProgressBar hours={8.5} targetHours={8.5} />);

      const progressElement = container.querySelector(".progress-bar");
      expect(progressElement).toHaveClass("bg-success");
    });

    it("switches to warning variant when exceeding target", () => {
      const { container } = render(<ProgressBar hours={9} targetHours={8.5} />);

      const progressElement = container.querySelector(".progress-bar");
      expect(progressElement).toHaveClass("bg-warning");
    });

    it("shows warning for significantly over target", () => {
      const { container } = render(<ProgressBar hours={15} targetHours={8.5} />);

      const progressElement = container.querySelector(".progress-bar");
      expect(progressElement).toHaveClass("bg-warning");
    });
  });

  describe("Edge Cases and Boundaries", () => {
    it("handles zero hours correctly", () => {
      const { container } = render(<ProgressBar hours={0} />);

      expect(container.textContent).toContain("0.00");
      expect(container.textContent).toContain("0.0%");
    });

    it("displays very small hour amounts", () => {
      const { container } = render(<ProgressBar hours={0.05} targetHours={8.5} />);

      expect(container.textContent).toContain("0.05");
    });

    it("handles complete day at 100 percent", () => {
      const { container } = render(<ProgressBar hours={8.5} targetHours={8.5} />);

      expect(container.textContent).toContain("100.0%");
    });

    it("displays overtime hours beyond 100 percent", () => {
      const { container } = render(<ProgressBar hours={12.75} targetHours={8.5} />);

      // 12.75 / 8.5 = 150%
      expect(container.textContent).toContain("150.0%");
    });

    it("formats fractional percentages correctly", () => {
      const { container } = render(<ProgressBar hours={2.83} targetHours={8.5} />);

      // 2.83 / 8.5 = ~33.29%
      expect(container.textContent).toMatch(/33\.\d%/);
    });
  });

  describe("Layout and Spacing", () => {
    it("applies vertical margin to container", () => {
      const { container } = render(<ProgressBar hours={4} />);

      const wrapper = container.querySelector(".my-3");
      expect(wrapper).toBeInTheDocument();
    });

    it("adds top margin to text display", () => {
      const { container } = render(<ProgressBar hours={4} />);

      const textDisplay = container.querySelector(".text-muted");
      expect(textDisplay).toHaveClass("mt-2");
    });

    it("uses muted text styling for hour display", () => {
      const { container } = render(<ProgressBar hours={4} />);

      const textDisplay = container.querySelector(".text-muted");
      expect(textDisplay).toBeInTheDocument();
    });
  });

  describe("Default Configuration", () => {
    it("uses 8 hours as default target when not specified", () => {
      const { container } = render(<ProgressBar hours={8} />);

      // Should be exactly 100% with default target
      expect(container.textContent).toContain("100.0%");
    });

    it("allows target override via props", () => {
      const { container } = render(<ProgressBar hours={7.5} targetHours={7.5} />);

      expect(container.textContent).toContain("100.0%");
    });
  });

  describe("Precision and Rounding", () => {
    it("rounds hours to two decimal places", () => {
      const { container } = render(<ProgressBar hours={3.14159} />);

      expect(container.textContent).toContain("3.14");
    });

    it("rounds percentage to one decimal place", () => {
      const { container } = render(<ProgressBar hours={3.333} targetHours={10} />);

      // 3.333 / 10 = 33.33%
      expect(container.textContent).toContain("33.3%");
    });

    it("preserves trailing zeros in hour display", () => {
      const { container } = render(<ProgressBar hours={5} />);

      expect(container.textContent).toContain("5.00");
    });
  });

  describe("Component Composition", () => {
    it("wraps Bootstrap ProgressBar component", () => {
      const { container } = render(<ProgressBar hours={4} />);

      const bootstrapProgress = container.querySelector(".progress");
      expect(bootstrapProgress).toBeInTheDocument();
    });

    it("provides textual hour information below bar", () => {
      const { container } = render(<ProgressBar hours={6.25} />);

      const wrapper = container.querySelector(".my-3");
      expect(wrapper?.textContent).toContain("6.25h");
      expect(wrapper?.textContent).toContain("%");
    });
  });
});
