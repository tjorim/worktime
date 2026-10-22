import { HouseIcon } from "lucide-react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ChoiceToggleGroup } from "@/components/shared/ChoiceToggleGroup";

const options = [
  { value: "a", label: "Alpha", icon: HouseIcon },
  { value: "b", label: "Beta" },
] as const;

describe("ChoiceToggleGroup", () => {
  it("names the group and exposes the selected option with aria-pressed", () => {
    render(<ChoiceToggleGroup label="Pick one" value="a" onChange={vi.fn()} options={options} />);

    expect(screen.getByRole("group", { name: "Pick one" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "false");
  });

  it("leaves every option unpressed when nothing is selected", () => {
    render(
      <ChoiceToggleGroup label="Pick one" value={undefined} onChange={vi.fn()} options={options} />,
    );

    for (const button of screen.getAllByRole("button")) {
      expect(button).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("reports the chosen option, and again when the selected one is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceToggleGroup label="Pick one" value="a" onChange={onChange} options={options} />);

    await user.click(screen.getByRole("button", { name: "Beta" }));
    expect(onChange).toHaveBeenLastCalledWith("b");

    await user.click(screen.getByRole("button", { name: "Alpha" }));
    expect(onChange).toHaveBeenLastCalledWith("a");
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("stays controlled: the pressed option only changes with the value prop", async () => {
    const user = userEvent.setup();
    render(<ChoiceToggleGroup label="Pick one" value="a" onChange={vi.fn()} options={options} />);

    await user.click(screen.getByRole("button", { name: "Beta" }));

    expect(screen.getByRole("button", { name: "Alpha" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-pressed", "false");
  });

  it("supports keyboard use: Tab in, arrow keys move focus, Enter and Space activate", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceToggleGroup label="Pick one" value="a" onChange={onChange} options={options} />);

    await user.tab();
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("button", { name: "Beta" })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("b");

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("button", { name: "Alpha" })).toHaveFocus();

    // Re-activating the selected option still reports it (reopens dialogs).
    await user.keyboard(" ");
    expect(onChange).toHaveBeenLastCalledWith("a");
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
