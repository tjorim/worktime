import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Step6TimeTrackingSetup } from "@/components/wizard/Step6TimeTrackingSetup";

const defaultProps = {
  isEnabled: true,
  onToggle: vi.fn(),
  onPrev: vi.fn(),
  onComplete: vi.fn(),
};

describe("Step6TimeTrackingSetup", () => {
  describe("isLastStep prop", () => {
    it("shows 'Continue' button text when isLastStep is not set", () => {
      render(<Step6TimeTrackingSetup {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Continue' button text when isLastStep is false", () => {
      render(<Step6TimeTrackingSetup {...defaultProps} isLastStep={false} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Finish Setup' button text when isLastStep is true", () => {
      render(<Step6TimeTrackingSetup {...defaultProps} isLastStep={true} />);
      expect(screen.getByRole("button", { name: /Finish Setup/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue/i })).not.toBeInTheDocument();
    });

    it("forward button has bi-arrow-right icon class when not the last step", () => {
      const { container } = render(
        <Step6TimeTrackingSetup {...defaultProps} isLastStep={false} />,
      );
      expect(container.querySelector(".bi-arrow-right")).toBeInTheDocument();
      expect(container.querySelector(".bi-check-lg")).not.toBeInTheDocument();
    });

    it("forward button has bi-check-lg icon class when isLastStep is true", () => {
      const { container } = render(<Step6TimeTrackingSetup {...defaultProps} isLastStep={true} />);
      expect(container.querySelector(".bi-check-lg")).toBeInTheDocument();
      expect(container.querySelector(".bi-arrow-right")).not.toBeInTheDocument();
    });

    it("calls onComplete when the forward button is clicked", async () => {
      const onComplete = vi.fn();
      const { getByRole } = render(
        <Step6TimeTrackingSetup {...defaultProps} isLastStep={true} onComplete={onComplete} />,
      );
      getByRole("button", { name: /Finish Setup/i }).click();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});