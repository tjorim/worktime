import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { EventStoreProvider, useEventStore } from "@/contexts/EventStoreContext";
import {
  buildTimeOffEntryForRange,
  createWeeklyTimeOffEntry,
} from "@/lib/timeOff/codecs";
import type { TimeOffEntry } from "@/lib/timeOff/types";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EventStoreProvider>{children}</EventStoreProvider>
);

function createDateEntry(
  date: string,
  note: string,
  entryType: TimeOffEntry["entryType"] = "vacation",
) {
  return buildTimeOffEntryForRange({
    start: date,
    end: date,
    note,
    entryType,
    entryFlag: "full_day",
  });
}

function createRangeEntry(
  start: string,
  end: string,
  note: string,
  entryType: TimeOffEntry["entryType"] = "vacation",
) {
  return buildTimeOffEntryForRange({
    start,
    end,
    note,
    entryType,
    entryFlag: "full_day",
  });
}

function createWeeklyEntry(
  weekday: number,
  note: string,
  entryType: TimeOffEntry["entryType"] = "in",
) {
  return createWeeklyTimeOffEntry({
    weekday,
    note,
    entryType,
    entryFlag: "full_day",
  });
}

describe("EventStoreContext", () => {
  // Collections are cleared globally in tests/setup.ts beforeEach.
  beforeEach(() => {
    localStorage.removeItem("worktime_hday_raw");
  });

  describe("Initial State", () => {
    it("should start with empty entries", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      expect(result.current.entries).toEqual([]);
      expect(result.current.rawText).toBe("");
    });
  });

  describe("addEntries", () => {
    it("should add a new date entry", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "New event")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("New event");
    });

    it("should persist entry in the store", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Persisted event")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("Persisted event");
      const e = result.current.entries[0];
      expect(e?.entryKind === "date" ? e.date : null).toBe("2025-01-15");
    });

    it("should add weekly entry", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createWeeklyEntry(1, "Every Monday")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.entryKind).toBe("weekly");
      if (result.current.entries[0]?.entryKind === "weekly") {
        expect(result.current.entries[0].weekday).toBe(1);
      }
    });
  });

  describe("updateEntry", () => {
    it("should update an existing entry", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Original")]);
      });

      const entryId = result.current.entries[0]?.id;
      expect(entryId).toBeTruthy();

      act(() => {
        result.current.updateEntry(entryId!, createDateEntry("2025-01-15", "Updated", "business"));
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("Updated");
      expect(result.current.entries[0]?.entryType).toBe("business");
    });

    it("should persist update in the store", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Original")]);
      });

      const entryId = result.current.entries[0]?.id;
      expect(entryId).toBeTruthy();

      act(() => {
        result.current.updateEntry(entryId!, createDateEntry("2025-01-20", "Updated", "business"));
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("Updated");
      const e = result.current.entries[0];
      expect(e?.entryKind === "date" ? e.date : null).toBe("2025-01-20");
    });
  });

  describe("deleteEntry", () => {
    it("should delete an entry by id", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([
          createDateEntry("2025-01-15", "Event 1"),
          createDateEntry("2025-01-16", "Event 2"),
        ]);
      });

      expect(result.current.entries).toHaveLength(2);

      const firstId = result.current.entries[0]?.id;
      expect(firstId).toBeTruthy();

      act(() => {
        result.current.deleteEntry(firstId!);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("Event 2");
    });

    it("should remove the entry from the store", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "To be deleted")]);
      });

      const entryId = result.current.entries[0]?.id;
      expect(entryId).toBeTruthy();

      act(() => {
        result.current.deleteEntry(entryId!);
      });

      expect(result.current.entries).toHaveLength(0);
    });
  });

  describe("deleteEntries", () => {
    it("should delete multiple entries by id", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([
          createDateEntry("2025-01-15", "Event 1"),
          createDateEntry("2025-01-16", "Event 2"),
          createDateEntry("2025-01-17", "Event 3"),
        ]);
      });

      const idsToDelete = [result.current.entries[0]?.id, result.current.entries[2]?.id].filter(
        (id): id is string => Boolean(id),
      );

      act(() => {
        result.current.deleteEntries(idsToDelete);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("Event 2");
    });
  });

  describe("getEventsInRange", () => {
    it("should return events within the date range", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([
          createDateEntry("2025-01-15", "Event in range"),
          createDateEntry("2025-02-15", "Event out of range"),
        ]);
      });

      const rangeEvents = result.current.getEventsInRange(
        new Date("2025-01-01"),
        new Date("2025-01-31"),
      );

      expect(rangeEvents).toHaveLength(1);
      expect(rangeEvents[0]?.label).toBe("Event in range");
    });

    it("should expand weekly entries within range", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createWeeklyEntry(1, "Every Monday")]);
      });

      const rangeEvents = result.current.getEventsInRange(
        new Date("2025-01-01"),
        new Date("2025-01-31"),
      );

      expect(rangeEvents).toHaveLength(4);
      rangeEvents.forEach((event) => {
        expect(event.label).toBe("Every Monday");
      });
    });

    it("should return empty array when no entries are in range", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-12-25", "Christmas")]);
      });

      const rangeEvents = result.current.getEventsInRange(
        new Date("2025-01-01"),
        new Date("2025-01-31"),
      );

      expect(rangeEvents).toHaveLength(0);
    });
  });

  describe("importHday", () => {
    it("should import valid .hday content", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const hdayContent = `2025/01/15 # Event 1
2025/01/16 # Event 2
d1 # Every Monday`;

      act(() => {
        result.current.importHday(hdayContent);
      });

      expect(result.current.entries).toHaveLength(3);
      expect(result.current.entries[0]?.note).toBe("Event 1");
      expect(result.current.entries[1]?.note).toBe("Event 2");
      expect(result.current.entries[2]?.entryKind).toBe("weekly");
    });

    it("should replace existing entries on import", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-01", "Old event")]);
      });

      act(() => {
        result.current.importHday("2025/01/15 # New event\n");
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("New event");
    });

    it("should persist imported content in the store", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const hdayContent = "2025/01/15 # Imported event\n";

      act(() => {
        result.current.importHday(hdayContent);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.note).toBe("Imported event");
      const e = result.current.entries[0];
      expect(e?.entryKind === "date" ? e.date : null).toBe("2025-01-15");
    });
  });

  describe("clearAll", () => {
    it("should clear all entries", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Event to clear")]);
      });

      expect(result.current.entries).toHaveLength(1);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.entries).toHaveLength(0);
      expect(result.current.rawText).toBe("");
    });

    it("should empty the store after clearAll", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Event to clear")]);
      });

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.entries).toHaveLength(0);
    });
  });

  describe("Entry Sorting", () => {
    it("should sort dated entries by starting date", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-12-25", "Christmas")]);
      });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "January event")]);
      });

      act(() => {
        result.current.addEntries([createDateEntry("2025-06-10", "June event")]);
      });

      expect(result.current.entries).toHaveLength(3);
      expect(result.current.entries[0]?.note).toBe("January event");
      expect(result.current.entries[1]?.note).toBe("June event");
      expect(result.current.entries[2]?.note).toBe("Christmas");
    });

    it("should maintain sort order after importing raw .hday content", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const unsortedHday = `2025/12/25 # Christmas
2025/01/15 # January event
2025/06/10 # June event
`;

      act(() => {
        result.current.importHday(unsortedHday);
      });

      expect(result.current.entries).toHaveLength(3);
      expect(result.current.entries[0]?.note).toBe("January event");
      expect(result.current.entries[1]?.note).toBe("June event");
      expect(result.current.entries[2]?.note).toBe("Christmas");

      expect(result.current.rawText).toContain("2025/01/15");
      expect(result.current.rawText.indexOf("2025/01/15")).toBeLessThan(
        result.current.rawText.indexOf("2025/06/10"),
      );
      expect(result.current.rawText.indexOf("2025/06/10")).toBeLessThan(
        result.current.rawText.indexOf("2025/12/25"),
      );
    });

    it("should sort dated entries before weekly entries", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createWeeklyEntry(1, "Monday in office")]);
      });

      act(() => {
        result.current.addEntries([createDateEntry("2025-12-25", "Christmas")]);
      });

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[0]?.entryKind).toBe("date");
      expect(result.current.entries[0]?.note).toBe("Christmas");
      expect(result.current.entries[1]?.entryKind).toBe("weekly");
      expect(result.current.entries[1]?.note).toBe("Monday in office");
    });

    it("should keep range entries as a single canonical entry", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createRangeEntry("2025-05-01", "2025-05-03", "Long weekend")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.entryKind).toBe("range");
      const entry = result.current.entries[0];
      if (entry?.entryKind === "range") {
        expect(entry.start).toBe("2025-05-01");
        expect(entry.end).toBe("2025-05-03");
      }
    });
  });
});