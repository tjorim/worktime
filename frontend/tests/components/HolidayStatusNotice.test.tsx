import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { HolidayStatusNotice } from "@/components/HolidayStatusNotice";

it("renders nothing when holidays are ready", () => {
  const { container } = render(<HolidayStatusNotice status="ready" />);
  expect(container).toBeEmptyDOMElement();
});

it("explains loading and unavailable holiday data", () => {
  const { rerender } = render(<HolidayStatusNotice status="loading" />);
  expect(screen.getByText(/Loading public holidays/)).toBeInTheDocument();
  rerender(<HolidayStatusNotice status="error" />);
  expect(screen.getByText(/could not be loaded/)).toBeInTheDocument();
});
