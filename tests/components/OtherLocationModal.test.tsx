import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { dayjs } from "../../src/utils/dateTimeUtils";
import { OtherLocationModal } from "../../src/components/calendar/OtherLocationModal";
import { toCountryCode } from "../../src/types/workLocation";

const DATE = dayjs("2026-02-18");
const cc = (value: string) => toCountryCode(value)!;

function renderModal(props: Partial<React.ComponentProps<typeof OtherLocationModal>> = {}) {
  const onHide = vi.fn();
  const onConfirm = vi.fn();
  const renderResult = render(
    <OtherLocationModal show={true} date={DATE} onHide={onHide} onConfirm={onConfirm} {...props} />,
  );
  return { onHide, onConfirm, ...renderResult };
}

describe("OtherLocationModal", () => {
  it("renders the modal title with the formatted date", () => {
    renderModal();
    expect(screen.getByText(/Other Location — Wednesday, 18 Feb 2026/)).toBeInTheDocument();
  });

  it("renders the country code and label form fields", () => {
    renderModal();
    expect(screen.getByLabelText("Country Code")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Label/)).toBeInTheDocument();
  });

  it("pre-fills country code and label from an existing other-location entry", () => {
    renderModal({
      existing: { location: "other", countryCode: cc("DE"), label: "Berlin office" },
    });
    expect(screen.getByLabelText("Country Code")).toHaveValue("DE");
    expect(screen.getByLabelText(/^Label/)).toHaveValue("Berlin office");
  });

  it("does not pre-fill when existing entry is a home or office location", () => {
    renderModal({ existing: { location: "home", countryCode: cc("NL") } });
    expect(screen.getByLabelText("Country Code")).toHaveValue("");
  });

  it("auto-uppercases typed country code", async () => {
    renderModal();
    const input = screen.getByLabelText("Country Code");
    await userEvent.type(input, "de");
    expect(input).toHaveValue("DE");
  });

  it("limits country code to 2 characters", async () => {
    renderModal();
    const input = screen.getByLabelText("Country Code");
    await userEvent.type(input, "DEU");
    expect(input).toHaveValue("DE");
  });

  it("calls onConfirm with countryCode and label when form is submitted with valid code", () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByLabelText("Country Code"), { target: { value: "DE" } });
    fireEvent.change(screen.getByLabelText(/^Label/), {
      target: { value: "Berlin office" },
    });
    const confirmButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith("DE", "Berlin office");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm with undefined label when label is empty", () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByLabelText("Country Code"), { target: { value: "FR" } });
    const confirmButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledWith("FR", undefined);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not call onConfirm when country code is invalid on submit", () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByLabelText("Country Code"), { target: { value: "D" } });
    const confirmButton = screen.getByRole("button", { name: /save/i });
    fireEvent.click(confirmButton);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows validation feedback after blur when code is invalid", () => {
    renderModal();
    const input = screen.getByLabelText("Country Code");
    fireEvent.change(input, { target: { value: "D" } });
    fireEvent.blur(input);
    expect(screen.getByText(/Enter a valid 2-letter ISO country code/)).toBeInTheDocument();
  });

  it("calls onHide when Cancel button is clicked", () => {
    const { onHide } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onHide).toHaveBeenCalled();
  });
});
