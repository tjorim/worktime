import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DayNavigationButtonGroup } from "@/components/shared/NavigationButtonGroup";

describe("DayNavigationButtonGroup", () => {
  it("stacks the selector and controls into full rows below the small breakpoint", () => {
    render(
      <DayNavigationButtonGroup
        isCurrent={false}
        onPrevious={vi.fn()}
        onCurrent={vi.fn()}
        onNext={vi.fn()}
        selectorLabel="Jump to date"
        selectorValue="2026-08-22"
        onSelectorChange={vi.fn()}
      />,
    );

    const container = screen.getByText("Jump to date").parentElement?.parentElement;
    expect(container).toHaveClass("flex-column", "flex-sm-row", "align-items-stretch");
    expect(screen.getByLabelText("Jump to date")).toHaveAttribute("type", "date");
  });
});
