import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RawContentPanel } from "../../../src/components/timeoff/RawContentPanel";

describe("RawContentPanel", () => {
  const defaultProps = {
    rawText: "",
    error: undefined,
    isDirty: false,
    onChangeRawText: vi.fn(),
    onApply: vi.fn(),
    onReset: vi.fn(),
  };

  it("should render the panel header", () => {
    render(<RawContentPanel {...defaultProps} />);

    expect(screen.getAllByText(/Raw \.hday content/i).length).toBeGreaterThan(0);
  });

  it("should display textarea with correct value", async () => {
    const { rerender } = render(<RawContentPanel {...defaultProps} rawText="2025/01/15 # Test" />);

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    expect(textarea).toHaveValue("2025/01/15 # Test");

    // Update props
    rerender(<RawContentPanel {...defaultProps} rawText="2025/01/20 # Updated" />);
    expect(textarea).toHaveValue("2025/01/20 # Updated");
  });

  it("should call onChangeRawText when textarea value changes", async () => {
    const mockOnChange = vi.fn();
    render(<RawContentPanel {...defaultProps} onChangeRawText={mockOnChange} />);

    const user = userEvent.setup();

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    await user.clear(textarea);
    await user.type(textarea, "Test");

    // Verify the callback was called with string arguments
    expect(mockOnChange).toHaveBeenCalled();
    expect(mockOnChange).toHaveBeenCalledWith(expect.any(String));
  });

  it("should call onApply when Apply button is clicked", async () => {
    const mockOnApply = vi.fn();
    render(<RawContentPanel {...defaultProps} onApply={mockOnApply} />);

    const user = userEvent.setup();

    const applyButton = screen.getByRole("button", { name: /Apply raw content/i });
    await user.click(applyButton);

    expect(mockOnApply).toHaveBeenCalledTimes(1);
  });

  it("should call onReset when Reset button is clicked", async () => {
    const mockOnReset = vi.fn();
    render(<RawContentPanel {...defaultProps} isDirty={true} onReset={mockOnReset} />);

    const user = userEvent.setup();

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    await user.click(resetButton);

    expect(mockOnReset).toHaveBeenCalledTimes(1);
  });

  it("should disable Reset button when not dirty", async () => {
    render(<RawContentPanel {...defaultProps} isDirty={false} />);

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    expect(resetButton).toBeDisabled();
  });

  it("should enable Reset button when dirty", async () => {
    render(<RawContentPanel {...defaultProps} isDirty={true} />);

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    expect(resetButton).toBeEnabled();
  });

  it("should display error message when error prop is provided", async () => {
    render(<RawContentPanel {...defaultProps} error="Invalid .hday format" />);

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toHaveTextContent("Invalid .hday format");
  });

  it("should not display error message when error prop is undefined", async () => {
    render(<RawContentPanel {...defaultProps} error={undefined} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should have proper accessibility attributes", async () => {
    render(<RawContentPanel {...defaultProps} error="Parse error" />);

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    const errorMessage = screen.getByRole("alert");

    // Textarea should be associated with error message
    expect(textarea).toHaveAttribute("aria-describedby");
    expect(errorMessage).toHaveAttribute("id", textarea.getAttribute("aria-describedby"));
  });

  it("should show placeholder text in textarea", async () => {
    render(<RawContentPanel {...defaultProps} />);

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    expect(textarea).toHaveAttribute("placeholder");
    expect(textarea.getAttribute("placeholder")).toContain("Example:");
  });
});
