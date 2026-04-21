import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { Step8WorkLocationSetup } from "@/components/wizard/Step8WorkLocationSetup";

vi.mock("react-select", () => ({
  default: ({
    options = [],
    value = null,
    onChange = () => {},
    inputId,
    "aria-label": ariaLabel,
  }: {
    options?: { value: string; label: string }[];
    value?: { value: string; label: string } | null;
    onChange?: (v: unknown) => void;
    inputId?: string;
    "aria-label"?: string;
  }) => (
    <select
      id={inputId}
      aria-label={ariaLabel}
      value={value?.value ?? ""}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val ? { value: val, label: e.target.options[e.target.selectedIndex].text } : null);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

const defaultProps = {
  isEnabled: false,
  onToggle: vi.fn(),
  homeCountry: null,
  officeCountry: null,
  onHomeCountryChange: vi.fn(),
  onOfficeCountryChange: vi.fn(),
  onPrev: vi.fn(),
  onComplete: vi.fn(),
};

describe("Step8WorkLocationSetup", () => {
  describe("isLastStep prop", () => {
    it("shows 'Continue' button text when isLastStep is not set", () => {
      render(<Step8WorkLocationSetup {...defaultProps} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Continue' button text when isLastStep is false", () => {
      render(<Step8WorkLocationSetup {...defaultProps} isLastStep={false} />);
      expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Finish Setup/i })).not.toBeInTheDocument();
    });

    it("shows 'Finish Setup' button text when isLastStep is true", () => {
      render(<Step8WorkLocationSetup {...defaultProps} isLastStep={true} />);
      expect(screen.getByRole("button", { name: /Finish Setup/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Continue/i })).not.toBeInTheDocument();
    });

    it("forward button has bi-arrow-right icon class when not the last step", () => {
      const { container } = render(
        <Step8WorkLocationSetup {...defaultProps} isLastStep={false} />,
      );
      expect(container.querySelector(".bi-arrow-right")).toBeInTheDocument();
      expect(container.querySelector(".bi-check-lg")).not.toBeInTheDocument();
    });

    it("forward button has bi-check-lg icon class when isLastStep is true", () => {
      const { container } = render(<Step8WorkLocationSetup {...defaultProps} isLastStep={true} />);
      expect(container.querySelector(".bi-check-lg")).toBeInTheDocument();
      expect(container.querySelector(".bi-arrow-right")).not.toBeInTheDocument();
    });

    it("calls onComplete when forward button is clicked", () => {
      const onComplete = vi.fn();
      render(<Step8WorkLocationSetup {...defaultProps} isLastStep={true} onComplete={onComplete} />);
      screen.getByRole("button", { name: /Finish Setup/i }).click();
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });
});