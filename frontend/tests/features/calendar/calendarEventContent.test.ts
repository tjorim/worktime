import { describe, expect, it } from "vitest";
import { Temporal } from "temporal-polyfill";
import { withCalendarEventContent } from "@/features/calendar/calendarEventContent";

const event = {
  id: "morning",
  title: "Morning <script>",
  start: Temporal.ZonedDateTime.from("2026-10-24T07:00+02:00[Europe/Brussels]"),
  end: Temporal.ZonedDateTime.from("2026-10-24T15:00+02:00[Europe/Brussels]"),
};

describe("calendar clock preference", () => {
  it.each([
    ["24h", "07:00", "15:00"],
    ["12h", "07:00 am", "03:00 pm"],
  ] as const)("renders local event times with %s", (timeFormat, start, end) => {
    const result = withCalendarEventContent(event, "en-GB", timeFormat);
    expect(result._customContent?.monthGrid).toContain(start);
    expect(result._customContent?.timeGrid).toContain(`${start}–${end}`);
    expect(result._customContent?.monthAgenda).toContain(`${start}–${end}`);
    expect(result._customContent?.monthGrid).toContain("Morning &lt;script&gt;");
  });

  it("leaves all-day entries to the calendar's locale formatting", () => {
    const allDay = {
      ...event,
      start: Temporal.PlainDate.from("2026-10-24"),
      end: Temporal.PlainDate.from("2026-10-25"),
    };
    expect(withCalendarEventContent(allDay, "nl-NL", "24h")).toBe(allDay);
  });
});
