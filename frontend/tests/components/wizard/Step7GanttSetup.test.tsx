import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Step7GanttSetup } from "@/components/wizard/Step7GanttSetup";

const defaultProps = {
  isEnabled: true,
  onToggle: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
};

describe("Step7GanttSetup", () => {
  describe("isLastStep prop", () => {
    it("shows 'Continue' button text when isLastStep is not set", () => {
      render(<Step7GanttSetup {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Continue' button text when isLastStep is false", () => {
      render(<Step7GanttSetup {...defaultProps} isLastStep={false} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Finish Setup' button text when isLastStep is true", () => {
      render(<Step7GanttSetup {...defaultProps} isLastStep={true} />);
      expect(screen.getByRole("button", { name: /Finish Setup/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue/i })).not.toBeInTheDocument();
    });

    it("forward button has bi-arrow-right icon class when not the last step", () => {
      const { container } = render(<Step7GanttSetup {...defaultProps} isLastStep={false} />);
      expect(container.querySelector(".bi-arrow-right")).toBeInTheDocument();
      expect(container.querySelector(".bi-check-lg")).not.toBeInTheDocument();
    });

    it("forward button has bi-check-lg icon class when isLastStep is true", () => {
      const { container } = render(<Step7GanttSetup {...defaultProps} isLastStep={true} />);
      expect(container.querySelector(".bi-check-lg")).toBeInTheDocument();
      expect(container.querySelector(".bi-arrow-right")).not.toBeInTheDocument();
    });

    it("calls onNext when the forward button is clicked", () => {
      const onNext = vi.fn();
      render(<Step7GanttSetup {...defaultProps} isLastStep={false} onNext={onNext} />);
      screen.getByRole("button", { name: /Continue/i }).click();
      expect(onNext).toHaveBeenCalledTimes(1);
    });
  });
});