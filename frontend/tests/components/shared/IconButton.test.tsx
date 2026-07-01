import { render, screen } from "@testing-library/react";
import { IconButton } from "@/components/shared/IconButton";

describe("IconButton", () => {
  it("uses the label as the accessible name and hides the decorative icon", () => {
    render(<IconButton icon="bi-chevron-left" label="Previous day" />);

    const button = screen.getByRole("button", { name: "Previous day" });
    expect(button).toHaveAttribute("aria-label", "Previous day");
    expect(button).toHaveAttribute("title", "Previous day");
    expect(button.querySelector("i")).toHaveAttribute("aria-hidden", "true");
  });
});
