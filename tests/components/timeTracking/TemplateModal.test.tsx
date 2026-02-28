import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { TemplateModal } from "../../../src/components/timeTracking/TemplateModal";


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
