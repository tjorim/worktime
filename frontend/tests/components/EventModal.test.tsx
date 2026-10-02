import { describe, expect, it, vi } from "vitest";
import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventModal } from "@/components/EventModal";
import {
  getTimeLocationFlagOptions,
  getTypeFlagOptions,
  TIME_LOCATION_FLAGS_AS_EVENT_FLAGS,
  TYPE_FLAGS_AS_EVENT_FLAGS,
} from "@/data/timeoffConstants";
import type { EventFlag } from "@/lib/hday/types";

function renderModal(props: Partial<React.ComponentProps<typeof EventModal>> = {}) {
  const handlers = {
    onHide: vi.fn(),
    onEntered: vi.fn(),
    onEventTypeChange: vi.fn(),
    onEventTitleChange: vi.fn(),
    onEventWeekdayChange: vi.fn(),
    onStartDateChange: vi.fn(),
    onEndDateChange: vi.fn(),
    onTypeFlagChange: vi.fn(),
    onTimeFlagChange: vi.fn(),
    onResetForm: vi.fn(),
    onSubmit: vi.fn(),
  };
  const eventFlags: ReadonlyArray<EventFlag> = [];
  render(
    <EventModal
      show
      formRef={createRef<HTMLDivElement>()}
      eventType="range"
      eventWeekday={1}
      eventStart="2026/03/02"
      eventEnd=""
      eventTitle=""
      eventFlags={eventFlags}
      startDateError=""
      endDateError=""
      previewLine="2026/03/02"
      typeFlagOptions={getTypeFlagOptions()}
      timeLocationFlagOptions={getTimeLocationFlagOptions()}
      typeFlagsAsEventFlags={TYPE_FLAGS_AS_EVENT_FLAGS}
      timeLocationFlagsAsEventFlags={TIME_LOCATION_FLAGS_AS_EVENT_FLAGS}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe("EventModal", () => {
  it("exposes each flag section as a labelled radio group with the current flag selected", () => {
    renderModal({ eventFlags: ["business", "onsite"] });

    const typeGroup = screen.getByRole("radiogroup", { name: "Type Flags" });
    expect(within(typeGroup).getByRole("radio", { name: "Business trip" })).toBeChecked();
    expect(within(typeGroup).getByRole("radio", { name: "Holiday (default)" })).not.toBeChecked();

    const locationGroup = screen.getByRole("radiogroup", { name: "Time / Location Flags" });
    expect(within(locationGroup).getByRole("radio", { name: "Onsite" })).toBeChecked();
  });

  it("selects the neutral option when a section has no flag", () => {
    renderModal({ eventFlags: [] });

    const typeGroup = screen.getByRole("radiogroup", { name: "Type Flags" });
    expect(within(typeGroup).getByRole("radio", { name: "Holiday (default)" })).toBeChecked();
    const locationGroup = screen.getByRole("radiogroup", { name: "Time / Location Flags" });
    expect(within(locationGroup).getByRole("radio", { name: "Full day" })).toBeChecked();
  });

  it("reports the picked flag and the neutral option through the section callbacks", async () => {
    const user = userEvent.setup();
    const handlers = renderModal({ eventFlags: ["business"] });

    await user.click(screen.getByRole("radio", { name: "Training/Course" }));
    expect(handlers.onTypeFlagChange).toHaveBeenCalledWith("course");

    await user.click(screen.getByRole("radio", { name: "Holiday (default)" }));
    expect(handlers.onTypeFlagChange).toHaveBeenLastCalledWith("none");

    await user.click(screen.getByRole("radio", { name: "AM (half day)" }));
    expect(handlers.onTimeFlagChange).toHaveBeenCalledWith("half_am");
  });

  it("links the start date error to its field and marks it invalid", () => {
    renderModal({ startDateError: "Start date is required" });

    const start = screen.getByLabelText(/Start \(YYYY\/MM\/DD\)/i);
    expect(start).toBeInvalid();
    expect(start).toHaveAccessibleDescription("Start date is required");
    expect(screen.getByLabelText(/End \(YYYY\/MM\/DD\)/i)).toBeValid();
  });

  it("switches the date fields for a weekday select when the event is weekly", () => {
    renderModal({ eventType: "weekly", eventWeekday: 3 });

    expect(screen.getByLabelText("Weekday")).toHaveValue("3");
    expect(screen.queryByLabelText(/Start \(YYYY\/MM\/DD\)/i)).not.toBeInTheDocument();
  });

  it("shows read-only badges instead of radios in view mode", () => {
    renderModal({ mode: "view", eventFlags: ["business"] });

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Business trip")).toBeInTheDocument();
    expect(screen.getByLabelText("Comment (optional)")).toBeDisabled();
    expect(screen.getByLabelText("Event type")).toBeDisabled();
  });
});
