import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { dayjs } from "@/utils/dateTimeUtils";
import { OtherLocationModal } from "@/components/calendar/OtherLocationModal";
import { toCountryCode } from "@/types/workLocation";

function setup(code?: string) {
  const onConfirm = vi.fn();
  const props = {
    show: true,
    date: dayjs("2026-02-18"),
    onHide: vi.fn(),
    onConfirm,
    existing: code
      ? { location: "other" as const, countryCode: toCountryCode(code)!, label: "Legacy label" }
      : undefined,
  };
  return { ...render(<OtherLocationModal {...props} showSetupHint />), props, onConfirm };
}

describe("OtherLocationModal", () => {
  it("selects a worldwide ISO country with the keyboard and saves its code", async () => {
    const { onConfirm } = setup();
    const picker = screen.getByRole("combobox", { name: "Country" });
    await userEvent.type(picker, "Japan");
    await userEvent.keyboard("{ArrowDown}{Enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("JP", undefined));
  });
  it.each(["XX", "ZZ", "UK"])("keeps legacy %s visible and requires correction", (code) => {
    setup(code);
    expect(
      screen.getByText(`Current value: ${code}. Select a country to correct it.`),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Label/)).toHaveValue("Legacy label");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
  it("typing an arbitrary code cannot save, and links to setup", async () => {
    const { onConfirm } = setup();
    await userEvent.type(screen.getByRole("combobox", { name: "Country" }), "ZZ");
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings?section=features");
    expect(onConfirm).not.toHaveBeenCalled();
  });
  it("renders the modal title with the formatted date", () => {
    setup();
    expect(screen.getByText(/Other Location — Wednesday, Feb 18, 2026/)).toBeInTheDocument();
  });
  it("pre-fills the country and label from an existing other-location entry", async () => {
    const { onConfirm } = setup("DE");
    expect(screen.getByLabelText(/^Label/)).toHaveValue("Legacy label");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("DE", "Legacy label"));
  });
  it("does not pre-fill the country from a home or office entry", () => {
    render(
      <OtherLocationModal
        show
        date={dayjs("2026-02-18")}
        onHide={vi.fn()}
        onConfirm={vi.fn()}
        existing={{ location: "home", countryCode: toCountryCode("NL")! }}
      />,
    );
    expect(screen.getByRole("combobox", { name: "Country" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });
  it("calls onHide when Cancel is clicked", async () => {
    const { props } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onHide).toHaveBeenCalled();
  });
  it("preserves a draft through background updates and resets on a new date", () => {
    const { props, rerender } = setup("DE");
    fireEvent.change(screen.getByLabelText(/^Label/), { target: { value: "Draft" } });
    rerender(<OtherLocationModal {...props} existing={{ ...props.existing!, label: "Synced" }} />);
    expect(screen.getByLabelText(/^Label/)).toHaveValue("Draft");
    rerender(<OtherLocationModal {...props} date={props.date.add(1, "day")} />);
    expect(screen.getByLabelText(/^Label/)).toHaveValue("Legacy label");
  });
});
