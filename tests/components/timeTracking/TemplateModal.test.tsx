import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TemplateModal } from "../../../src/components/timeTracking/TemplateModal";

vi.mock("react-select", () => ({
  default: ({
    options = [],
    value = null,
    onChange = () => {},
    inputId,
    isMulti = false,
    isDisabled = false,
    "aria-label": ariaLabel,
    "aria-describedby": ariaDescribedBy,
  }: {
    options?: Array<{ value: string; label: string }>;
    value?: Array<{ value: string; label: string }> | { value: string; label: string } | null;
    onChange?: (v: unknown) => void;
    inputId?: string;
    isMulti?: boolean;
    isDisabled?: boolean;
    "aria-label"?: string;
    "aria-describedby"?: string;
  }) => {
    const selectedValues = Array.isArray(value)
      ? value.map((v) => v.value)
      : value
        ? [value.value]
        : [];
    return (
      <select
        multiple={isMulti}
        id={inputId}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        disabled={isDisabled}
        value={isMulti ? selectedValues : (selectedValues[0] ?? "")}
        onChange={(e) => {
          if (isMulti) {
            onChange(
              Array.from(e.target.selectedOptions).map((o) => ({ value: o.value, label: o.text })),
            );
          } else {
            const val = e.target.value;
            onChange(
              val ? { value: val, label: e.target.options[e.target.selectedIndex].text } : null,
            );
          }
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

describe("TemplateModal", () => {
  const baseProps = {
    show: true,
    title: "Add Template",
    submitLabel: "Save",
    value: {
      text: "",
      label: "",
      start: "",
      stop: "",
    },
    onChange: vi.fn(),
    onClose: vi.fn(),
    onSubmit: vi.fn(),
  };

  it("describes disabled label selection when no labels exist", () => {
    render(<TemplateModal {...baseProps} labels={[]} />);

    const labelSelect = screen.getByLabelText(/^Label$/i);
    expect(labelSelect).toBeDisabled();
    expect(labelSelect).toHaveAttribute("aria-describedby", "templateLabelHelp");
    expect(
      screen.getByText(
        /Add at least one label in Time Tracking Settings before creating templates\./i,
      ),
    ).toBeInTheDocument();
  });

  it("does not render disabled helper text when labels are available", () => {
    render(
      <TemplateModal
        {...baseProps}
        labels={[
          { name: "Development", color: "#198754" },
          { name: "Support", color: "#c82333" },
        ]}
      />,
    );

    const labelSelect = screen.getByLabelText(/^Label$/i);
    expect(labelSelect).toBeEnabled();
    expect(labelSelect).not.toHaveAttribute("aria-describedby");
    expect(
      screen.queryByText(
        /Add at least one label in Time Tracking Settings before creating templates\./i,
      ),
    ).not.toBeInTheDocument();
  });
});
