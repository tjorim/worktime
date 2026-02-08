import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeOffRawView } from "../../../src/components/timeOff/TimeOffRawView";

describe("TimeOffRawView", () => {
  const defaultProps = {
    rawText: "",
    error: undefined,
    isDirty: false,
    onChangeRawText: vi.fn(),
    onApply: vi.fn(),
    onReset: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the card with header", () => {
    render(<TimeOffRawView {...defaultProps} />);

    const header = screen.getByText("Raw .hday content", { selector: ".card-header" });
    expect(header).toBeInTheDocument();
  });

  it("should display textarea with correct value", () => {
    const { rerender } = render(<TimeOffRawView {...defaultProps} rawText="2025/01/15 # Test" />);

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    expect(textarea).toHaveValue("2025/01/15 # Test");

    // Update props
    rerender(<TimeOffRawView {...defaultProps} rawText="2025/01/20 # Updated" />);
    expect(textarea).toHaveValue("2025/01/20 # Updated");
  });

  it("should call onChangeRawText when textarea value changes", async () => {
    const mockOnChange = vi.fn();
    const { rerender } = render(
      <TimeOffRawView {...defaultProps} onChangeRawText={mockOnChange} />,
    );

    const user = userEvent.setup();

    const textarea = screen.getByLabelText(/Raw \.hday content/i);

    // Type 'a' and update the component
    await user.type(textarea, "a");
    rerender(<TimeOffRawView {...defaultProps} rawText="a" onChangeRawText={mockOnChange} />);

    // Type 'b' and update the component
    await user.type(textarea, "b");
    rerender(<TimeOffRawView {...defaultProps} rawText="ab" onChangeRawText={mockOnChange} />);

    // Type 'c' and update the component
    await user.type(textarea, "c");

    // Verify the callback was called and final call has the complete text
    expect(mockOnChange).toHaveBeenCalled();
    expect(mockOnChange).toHaveBeenLastCalledWith("abc");
  });

  it("should call onApply when Apply button is clicked", async () => {
    const mockOnApply = vi.fn();
    render(<TimeOffRawView {...defaultProps} onApply={mockOnApply} />);

    const user = userEvent.setup();

    const applyButton = screen.getByRole("button", { name: /Apply raw content/i });
    await user.click(applyButton);

    expect(mockOnApply).toHaveBeenCalledTimes(1);
  });

  it("should call onReset when Reset button is clicked", async () => {
    const mockOnReset = vi.fn();
    render(<TimeOffRawView {...defaultProps} isDirty={true} onReset={mockOnReset} />);

    const user = userEvent.setup();

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    await user.click(resetButton);

    expect(mockOnReset).toHaveBeenCalledTimes(1);
  });

  it("should disable Reset button when not dirty", () => {
    render(<TimeOffRawView {...defaultProps} isDirty={false} />);

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    expect(resetButton).toBeDisabled();
  });

  it("should enable Reset button when dirty", () => {
    render(<TimeOffRawView {...defaultProps} isDirty={true} />);

    const resetButton = screen.getByRole("button", { name: /Reset/i });
    expect(resetButton).toBeEnabled();
  });

  it("should display error message when error prop is provided", () => {
    render(<TimeOffRawView {...defaultProps} error="Invalid .hday format" />);

    const errorMessage = screen.getByRole("alert");
    expect(errorMessage).toHaveTextContent("Invalid .hday format");
  });

  it("should not display error message when error prop is undefined", () => {
    render(<TimeOffRawView {...defaultProps} error={undefined} />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should have proper accessibility attributes", () => {
    render(<TimeOffRawView {...defaultProps} error="Parse error" />);

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    const errorMessage = screen.getByRole("alert");

    // Textarea should be associated with error message
    expect(textarea).toHaveAttribute("aria-describedby");
    expect(errorMessage).toHaveAttribute("id", textarea.getAttribute("aria-describedby"));
  });

  it("should show placeholder text in textarea", () => {
    render(<TimeOffRawView {...defaultProps} />);

    const textarea = screen.getByLabelText(/Raw \.hday content/i);
    expect(textarea).toHaveAttribute("placeholder");
    expect(textarea.getAttribute("placeholder")).toContain("Example:");
  });
});
