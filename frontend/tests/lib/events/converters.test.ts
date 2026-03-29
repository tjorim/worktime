import { describe, it, expect } from "vitest";
import { hdayToCalendarEvents, filterEventsInRange } from "../../../src/lib/events/converters";
import type { HdayEvent } from "../../../src/lib/hday/types";

describe("Event Converters", () => {
  describe("hdayToCalendarEvents", () => {
    it("should convert a single-day range event to one CalendarEvent", () => {
      const hdayEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "Day off",
      };

      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("holiday");
      expect(events[0].start).toBe("2025-01-15");
      expect(events[0].end).toBe("2025-01-15");
      expect(events[0].label).toBe("Day off");
      expect(events[0].id).toBeDefined();
    });

    it("should convert a multi-day range event to one CalendarEvent", () => {
      const hdayEvent: HdayEvent = {
        type: "range",
        start: "2025/12/23",
        end: "2025/12/27",
        flags: ["holiday"],
        title: "Christmas vacation",
      };

      const startDate = new Date("2025-12-01");
      const endDate = new Date("2025-12-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("holiday");
      expect(events[0].start).toBe("2025-12-23");
      expect(events[0].end).toBe("2025-12-27");
      expect(events[0].label).toBe("Christmas vacation");
    });

    it("should convert a weekly event to multiple CalendarEvents within range", () => {
      const hdayEvent: HdayEvent = {
        type: "weekly",
        weekday: 1, // Monday
        flags: ["in"],
        title: "Office day",
      };

      // January 2025: Mondays are 6, 13, 20, 27
      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      expect(events).toHaveLength(4);
      expect(events[0].start).toBe("2025-01-06");
      expect(events[1].start).toBe("2025-01-13");
      expect(events[2].start).toBe("2025-01-20");
      expect(events[3].start).toBe("2025-01-27");

      events.forEach((event) => {
        expect(event.type).toBe("holiday");
        expect(event.label).toBe("Office day");
        expect(event.end).toBe(event.start); // Single-day events
      });
    });

    it("should convert a weekly event for Friday (weekday 5)", () => {
      const hdayEvent: HdayEvent = {
        type: "weekly",
        weekday: 5, // Friday
        flags: ["weekend"],
        title: "Early weekend",
      };

      // January 2025: Fridays are 3, 10, 17, 24, 31
      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      expect(events).toHaveLength(5);
      expect(events[0].start).toBe("2025-01-03");
      expect(events[4].start).toBe("2025-01-31");
    });

    it("should filter weekly events outside the date range", () => {
      const hdayEvent: HdayEvent = {
        type: "weekly",
        weekday: 1, // Monday
        flags: ["in"],
        title: "Office day",
      };

      // Only first week of January 2025
      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-07");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      // Should only include Jan 6 (first Monday)
      expect(events).toHaveLength(1);
      expect(events[0].start).toBe("2025-01-06");
    });

    it("should convert range events regardless of date range (filtering happens separately)", () => {
      const hdayEvent: HdayEvent = {
        type: "range",
        start: "2025/12/01",
        end: "2025/12/31",
        flags: ["holiday"],
        title: "December vacation",
      };

      // Query for January only
      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      // Range events are always converted, filtering happens with filterEventsInRange
      expect(events).toHaveLength(1);
      expect(events[0].start).toBe("2025-12-01");
      expect(events[0].end).toBe("2025-12-31");
    });

    it("should include event metadata with color and flags", () => {
      const hdayEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["business", "half_am"],
        title: "Morning meeting",
      };

      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      expect(events).toHaveLength(1);
      expect(events[0].meta).toBeDefined();
      expect(events[0].meta?.type).toBe("holiday");
      expect(events[0].meta?.color).toBeDefined();
      expect(events[0].meta?.flags).toEqual(["business", "half_am"]);
      expect(events[0].meta?.typeLabel).toBeDefined();
    });

    it("should handle events with no title", () => {
      const hdayEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["holiday"],
      };

      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate);

      expect(events).toHaveLength(1);
      // When no title is provided, it falls back to the event type label
      expect(events[0].label).toBe("Holiday");
    });

    it("should include source index when provided", () => {
      const hdayEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "Test event",
      };

      const startDate = new Date("2025-01-01");
      const endDate = new Date("2025-01-31");
      const events = hdayToCalendarEvents(hdayEvent, startDate, endDate, 5);

      expect(events).toHaveLength(1);
      expect(events[0].meta?.sourceIndex).toBe(5);
    });
  });

  describe("filterEventsInRange", () => {
    it("should filter events within the date range", () => {
      const events = [
        {
          id: "1",
          type: "holiday" as const,
          start: "2025-01-05",
          end: "2025-01-05",
          label: "Event 1",
        },
        {
          id: "2",
          type: "holiday" as const,
          start: "2025-01-15",
          end: "2025-01-15",
          label: "Event 2",
        },
        {
          id: "3",
          type: "holiday" as const,
          start: "2025-01-25",
          end: "2025-01-25",
          label: "Event 3",
        },
      ];

      const filtered = filterEventsInRange(events, "2025-01-10", "2025-01-20");

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("2");
      expect(filtered[0].label).toBe("Event 2");
    });

    it("should include events that overlap the date range", () => {
      const events = [
        {
          id: "1",
          type: "holiday" as const,
          start: "2025-01-05",
          end: "2025-01-15", // Overlaps range
          label: "Multi-day event",
        },
      ];

      const filtered = filterEventsInRange(events, "2025-01-10", "2025-01-20");

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });

    it("should exclude events completely outside the date range", () => {
      const events = [
        {
          id: "1",
          type: "holiday" as const,
          start: "2025-01-01",
          end: "2025-01-05",
          label: "Too early",
        },
        {
          id: "2",
          type: "holiday" as const,
          start: "2025-01-25",
          end: "2025-01-31",
          label: "Too late",
        },
      ];

      const filtered = filterEventsInRange(events, "2025-01-10", "2025-01-20");

      expect(filtered).toHaveLength(0);
    });

    it("should handle empty event array", () => {
      const filtered = filterEventsInRange([], "2025-01-10", "2025-01-20");

      expect(filtered).toHaveLength(0);
    });

    it("should handle single-day range", () => {
      const events = [
        {
          id: "1",
          type: "holiday" as const,
          start: "2025-01-15",
          end: "2025-01-15",
          label: "Exact match",
        },
        {
          id: "2",
          type: "holiday" as const,
          start: "2025-01-14",
          end: "2025-01-14",
          label: "Before",
        },
      ];

      const filtered = filterEventsInRange(events, "2025-01-15", "2025-01-15");

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe("1");
    });
  });
});
