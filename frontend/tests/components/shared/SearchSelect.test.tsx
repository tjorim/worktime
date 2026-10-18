import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
  SearchSelect,
  MultiSearchSelect,
  type SelectOption,
} from "@/components/shared/SearchSelect";
import { CountrySelect } from "@/components/shared/CountrySelect";
import { TeamSelector } from "@/components/shared/TeamSelector";

const options = [
  { value: "one", label: "First" },
  { value: "two", label: "Second" },
];
function Picker() {
  const [value, setValue] = useState<SelectOption | null>({ ...options[0]! });
  return (
    <SearchSelect
      aria-label="Choice"
      options={options.map((option) => ({ ...option }))}
      value={value}
      onChange={setValue}
    />
  );
}

describe("SearchSelect", () => {
  it("resolves recreated options, filters, selects with the keyboard and clears", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const input = screen.getByRole("combobox", { name: "Choice" });
    expect(input).toHaveValue("First");
    await user.clear(input);
    await user.type(input, "Sec");
    expect(screen.queryByRole("option", { name: "First" })).not.toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue("Second");
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(input).toHaveValue("");
  });
  it("shows an empty result and Escape dismisses the popup", async () => {
    const user = userEvent.setup();
    render(<Picker />);
    const input = screen.getByRole("combobox", { name: "Choice" });
    await user.clear(input);
    await user.type(input, "missing");
    expect(screen.getByText("No options found.")).toBeVisible();
    await user.keyboard("{Escape}");
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
  it("disables the input and actions and preserves its description", () => {
    render(
      <SearchSelect
        aria-label="Choice"
        aria-describedby="help"
        options={options}
        value={options[0]!}
        onChange={vi.fn()}
        disabled
      />,
    );
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-describedby", "help");
    expect(screen.getByRole("button", { name: "Clear selection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open options" })).toBeDisabled();
  });
  it("returns country codes and clears to null", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(<CountrySelect value="BE" onChange={change} ariaLabel="Country" />);
    const input = screen.getByRole("combobox", { name: "Country" });
    expect(input).toHaveValue("Belgium");
    await user.clear(input);
    await user.type(input, "Nether");
    await user.click(screen.getByRole("option", { name: "Netherlands" }));
    expect(change).toHaveBeenLastCalledWith("NL");
    await user.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(change).toHaveBeenLastCalledWith(null);
  });
  it("adds multiple selections and removes individual chips", async () => {
    const user = userEvent.setup();
    function MultiPicker() {
      const [value, setValue] = useState<SelectOption[]>([{ ...options[0]! }]);
      return (
        <MultiSearchSelect
          aria-label="Dependencies"
          options={options}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<MultiPicker />);
    const input = screen.getByRole("combobox", { name: "Dependencies" });
    await user.type(input, "Sec");
    await user.keyboard("{ArrowDown}{Enter}");
    expect(screen.getByRole("button", { name: "Remove First" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Remove Second" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove First" }));
    expect(screen.queryByRole("button", { name: "Remove First" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove Second" })).toBeVisible();
  });
  it("uses a labelled non-searchable team select and returns numeric IDs", async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    render(
      <TeamSelector
        scheduleType="5-shift"
        selectedTeam={2}
        availableTeams={[2, 4]}
        label="Team"
        ariaLabel="Team"
        onChange={change}
      />,
    );
    await user.click(screen.getByRole("combobox", { name: "Team" }));
    expect(screen.getAllByRole("option")).toHaveLength(2);
    await user.click(screen.getByRole("option", { name: "Team 4" }));
    expect(change).toHaveBeenCalledWith(4);
  });
});
