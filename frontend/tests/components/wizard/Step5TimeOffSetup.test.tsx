import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Step5TimeOffSetup } from "@/components/wizard/Step5TimeOffSetup";

const defaultProps = {
  isEnabled: false,
  onToggle: vi.fn(),
  vacationAmount: "",
  vacationUnit: "days" as const,
  onVacationAmountChange: vi.fn(),
  onVacationUnitChange: vi.fn(),
  isInvalid: false,
  onPrev: vi.fn(),
  onNext: vi.fn(),
};

describe("Step5TimeOffSetup", () => {
  describe("isLastStep prop", () => {
    it("shows 'Continue' button text when isLastStep is not set", () => {
      render(<Step5TimeOffSetup {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Continue' button text when isLastStep is false", () => {
      render(<Step5TimeOffSetup {...defaultProps} isLastStep={false} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Finish Setup' button text when isLastStep is true", () => {
      render(<Step5TimeOffSetup {...defaultProps} isLastStep={true} />);
      expect(screen.getByRole("button", { name: /Finish Setup/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue/i })).not.toBeInTheDocument();
    });

    it("forward button has bi-arrow-right icon class when not the last step", () => {
      const { container } = render(<Step5TimeOffSetup {...defaultProps} isLastStep={false} />);
      const forwardIcon = container.querySelector(".bi-arrow-right");
      expect(forwardIcon).toBeInTheDocument();
      expect(container.querySelector(".bi-check-lg")).not.toBeInTheDocument();
    });

    it("forward button has bi-check-lg icon class when isLastStep is true", () => {
      const { container } = render(<Step5TimeOffSetup {...defaultProps} isLastStep={true} />);
      const checkIcon = container.querySelector(".bi-check-lg");
      expect(checkIcon).toBeInTheDocument();
      expect(container.querySelector(".bi-arrow-right")).not.toBeInTheDocument();
    });
  });
});