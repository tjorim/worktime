import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RawContentAccordion } from "../../../src/components/timeoff/RawContentAccordion";

describe("RawContentAccordion", () => {
  const defaultProps = {
    rawText: "",
    error: undefined,
    isDirty: false,
    onChangeRawText: vi.fn(),
    onApply: vi.fn(),
    onReset: vi.fn(),
  };

  it("should render the accordion with header", () => {
    render(<RawContentAccordion {...defaultProps} />);

    expect(screen.getByRole("button", { name: /Raw \.hday content/i })).toBeInTheDocument();
  });

  it("should display textarea with correct value", async () => {
    const { rerender } = render(<RawContentAccordion {...defaultProps} rawText="2025/01/15 # Test" />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    expect(textarea).toHaveValue("2025/01/15 # Test");

    // Update props
    rerender(<RawContentAccordion {...defaultProps} rawText="2025/01/20 # Updated" />);
    expect(textarea).toHaveValue("2025/01/20 # Updated");
  });

  it("should call onChangeRawText when textarea value changes", async () => {
    const mockOnChange = vi.fn();
    render(<RawContentAccordion {...defaultProps} onChangeRawText={mockOnChange} />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    await user.clear(textarea);
    await user.type(textarea, "Test");

    // Verify the callback was called when user types
    expect(mockOnChange).toHaveBeenCalled();
    expect(mockOnChange.mock.calls.length).toBeGreaterThan(0);
  });

  it("should call onApply when Apply button is clicked", async () => {
    const mockOnApply = vi.fn();
    render(<RawContentAccordion {...defaultProps} onApply={mockOnApply} />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const applyButton = screen.getByRole("button", { name: /Apply raw content/i });
    await user.click(applyButton);

    expect(mockOnApply).toHaveBeenCalledTimes(1);
  });

  it("should call onReset when Reset button is clicked", async () => {
    const mockOnReset = vi.fn();
    render(<RawContentAccordion {...defaultProps} isDirty={true} onReset={mockOnReset} />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    await user.click(resetButton);

    expect(mockOnReset).toHaveBeenCalledTimes(1);
  });

  it("should disable Reset button when not dirty", async () => {
    render(<RawContentAccordion {...defaultProps} isDirty={false} />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    expect(resetButton).toBeDisabled();
  });

  it("should enable Reset button when dirty", async () => {
    render(<RawContentAccordion {...defaultProps} isDirty={true} />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    expect(resetButton).toBeEnabled();
  });

  it("should display error message when error prop is provided", async () => {
    render(<RawContentAccordion {...defaultProps} error="Invalid .hday format" />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toHaveTextContent("Invalid .hday format");
  });

  it("should not display error message when error prop is undefined", async () => {
    render(<RawContentAccordion {...defaultProps} error={undefined} />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should have proper accessibility attributes", async () => {
    render(<RawContentAccordion {...defaultProps} error="Parse error" />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    const errorMessage = screen.getByRole("alert");

    // Textarea should be associated with error message
    expect(textarea).toHaveAttribute("aria-describedby");
    expect(errorMessage).toHaveAttribute("id", textarea.getAttribute("aria-describedby"));
  });

  it("should show placeholder text in textarea", async () => {
    render(<RawContentAccordion {...defaultProps} />);

    const user = userEvent.setup();

    // Open accordion
    await user.click(screen.getByRole("button", { name: /Raw \.hday content/i }));

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    expect(textarea).toHaveAttribute("placeholder");
    expect(textarea.getAttribute("placeholder")).toContain("Example:");
  });
});
