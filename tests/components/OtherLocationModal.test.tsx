import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { dayjs } from "../../src/utils/dateTimeUtils";
import { OtherLocationModal } from "../../src/components/calendar/OtherLocationModal";

const DATE = dayjs("2026-02-18");

function renderModal(
  props: Partial<React.ComponentProps<typeof OtherLocationModal>> = {},
) {
  const onHide = vi.fn();
  const onConfirm = vi.fn();
  render(
    <OtherLocationModal
      show={true}
      date={DATE}
      onHide={onHide}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onHide, onConfirm };
}

describe("OtherLocationModal", () => {
  it("renders the modal title with the formatted date", () => {
    renderModal();
    expect(
      screen.getByText(/Other Location — Wednesday, 18 Feb 2026/),
    ).toBeInTheDocument();
  });

  it("renders the country code and label form fields", () => {
    renderModal();
    expect(screen.getByLabelText("Country Code")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Berlin office, Client visit")).toBeInTheDocument();
  });

  it("pre-fills country code and label from an existing other-location entry", () => {
    renderModal({
      existing: { location: "other", countryCode: "DE", label: "Berlin office" },
    });
    expect(screen.getByLabelText("Country Code")).toHaveValue("DE");
    expect(screen.getByPlaceholderText("e.g. Berlin office, Client visit")).toHaveValue(
      "Berlin office",
    );
  });

  it("does not pre-fill when existing entry is a home or office location", () => {
    renderModal({ existing: { location: "home", countryCode: "NL" } });
    expect(screen.getByLabelText("Country Code")).toHaveValue("");
  });

  it("auto-uppercases typed country code", () => {
    renderModal();
    const input = screen.getByLabelText("Country Code");
    fireEvent.change(input, { target: { value: "de" } });
    expect(input).toHaveValue("DE");
  });

  it("limits country code to 2 characters", () => {
    renderModal();
    const input = screen.getByLabelText("Country Code");
    fireEvent.change(input, { target: { value: "DEU" } });
    expect(input).toHaveValue("DE");
  });

  it("calls onConfirm with countryCode and label when form is submitted with valid code", () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByLabelText("Country Code"), { target: { value: "DE" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Berlin office, Client visit"), {
      target: { value: "Berlin office" },
    });
    fireEvent.submit(document.querySelector("form")!);
    expect(onConfirm).toHaveBeenCalledWith("DE", "Berlin office");
  });

  it("calls onConfirm with undefined label when label is empty", () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByLabelText("Country Code"), { target: { value: "FR" } });
    fireEvent.submit(document.querySelector("form")!);
    expect(onConfirm).toHaveBeenCalledWith("FR", undefined);
  });

  it("does not call onConfirm when country code is invalid on submit", () => {
    const { onConfirm } = renderModal();
    fireEvent.change(screen.getByLabelText("Country Code"), { target: { value: "D" } });
    fireEvent.submit(document.querySelector("form")!);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("shows validation feedback after blur when code is invalid", () => {
    renderModal();
    const input = screen.getByLabelText("Country Code");
    fireEvent.change(input, { target: { value: "D" } });
    fireEvent.blur(input);
    expect(
      screen.getByText(/Enter a valid 2-letter ISO country code/),
    ).toBeInTheDocument();
  });

  it("calls onHide when Cancel button is clicked", () => {
    const { onHide } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onHide).toHaveBeenCalled();
  });
});
