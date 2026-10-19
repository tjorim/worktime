import { Sun as SunIcon } from "lucide-react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { ChoiceRadioGroup } from "@/components/shared/ChoiceRadioGroup";

const options = [
  { value: "a", label: "Alpha", icon: SunIcon },
  { value: "b", label: "Beta" },
  { value: "c", label: "Gamma" },
] as const;

describe("ChoiceRadioGroup", () => {
  it("names the group and checks exactly the selected option", () => {
    render(<ChoiceRadioGroup label="Pick one" value="a" onChange={vi.fn()} options={options} />);

    expect(screen.getByRole("radiogroup", { name: "Pick one" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Beta" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Gamma" })).not.toBeChecked();
  });

  it("reports a newly chosen option but not a re-click of the selected one", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceRadioGroup label="Pick one" value="a" onChange={onChange} options={options} />);

    await user.click(screen.getByRole("radio", { name: "Beta" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith("b");

    await user.click(screen.getByRole("radio", { name: "Alpha" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("stays controlled: the checked option only changes with the value prop", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ChoiceRadioGroup label="Pick one" value="a" onChange={vi.fn()} options={options} />,
    );

    await user.click(screen.getByRole("radio", { name: "Beta" }));
    expect(screen.getByRole("radio", { name: "Alpha" })).toBeChecked();

    rerender(<ChoiceRadioGroup label="Pick one" value="b" onChange={vi.fn()} options={options} />);
    expect(screen.getByRole("radio", { name: "Beta" })).toBeChecked();
  });

  it("supports keyboard use: Tab lands on the checked option and arrows move the selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ChoiceRadioGroup label="Pick one" value="a" onChange={onChange} options={options} />);

    await user.tab();
    expect(screen.getByRole("radio", { name: "Alpha" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Beta" })).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith("b");
  });
});
