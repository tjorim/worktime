import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { EventStoreProvider, useEventStore } from "@/contexts/EventStoreContext";
import {
  buildTimeOffEntryForRange,
  createWeeklyTimeOffEntry,
  entriesToHdayEvents,
} from "@/lib/timeOff/codecs";
import type { TimeOffEntry } from "@/lib/timeOff/types";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EventStoreProvider>{children}</EventStoreProvider>
);

function getEvents(entries: TimeOffEntry[]) {
  return entriesToHdayEvents(entries);
}

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
    flags: [],
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
    flags: [],
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
    flags: [],
  });
}

describe("EventStoreContext", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("Initial State", () => {
    it("should start with empty entries", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      expect(result.current.entries).toEqual([]);
      expect(result.current.rawText).toBe("");
    });

    it("should load entries from localStorage if present", () => {
      const testHday = "2025/01/15 # Test event\n";
      localStorage.setItem("worktime_hday_raw", testHday);

      const { result } = renderHook(() => useEventStore(), { wrapper });

      expect(result.current.rawText).toBe(testHday);
      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(1);
      expect(events[0]?.title).toBe("Test event");
    });
  });

  describe("addEntries", () => {
    it("should add a new date entry", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "New event")]);
      });

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(1);
      expect(events[0]?.title).toBe("New event");
    });

    it("should persist entry to localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Persisted event")]);
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      expect(stored).toContain("Persisted event");
      expect(stored).toContain("2025/01/15");
    });

    it("should add weekly entry", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createWeeklyEntry(1, "Every Monday")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.kind).toBe("weekly");
      if (result.current.entries[0]?.kind === "weekly") {
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

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(1);
      expect(events[0]?.title).toBe("Updated");
      expect(events[0]?.flags).toEqual(["business"]);
    });

    it("should persist update to localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Original")]);
      });

      const entryId = result.current.entries[0]?.id;
      expect(entryId).toBeTruthy();

      act(() => {
        result.current.updateEntry(entryId!, createDateEntry("2025-01-20", "Updated", "business"));
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      expect(stored).toContain("Updated");
      expect(stored).toContain("2025/01/20");
      expect(stored).not.toContain("Original");
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

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(1);
      expect(events[0]?.title).toBe("Event 2");
    });

    it("should persist deletion to localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "To be deleted")]);
      });

      const entryId = result.current.entries[0]?.id;
      expect(entryId).toBeTruthy();

      act(() => {
        result.current.deleteEntry(entryId!);
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      expect(stored).toBeNull();
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

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(1);
      expect(events[0]?.title).toBe("Event 2");
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

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(3);
      expect(events[0]?.title).toBe("Event 1");
      expect(events[1]?.title).toBe("Event 2");
      expect(events[2]?.type).toBe("weekly");
    });

    it("should replace existing entries on import", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-01", "Old event")]);
      });

      act(() => {
        result.current.importHday("2025/01/15 # New event\n");
      });

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(1);
      expect(events[0]?.title).toBe("New event");
    });

    it("should persist imported content to localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const hdayContent = "2025/01/15 # Imported event\n";

      act(() => {
        result.current.importHday(hdayContent);
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      expect(stored).toBe(hdayContent);
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

    it("should remove data from localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "Event to clear")]);
      });

      act(() => {
        result.current.clearAll();
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      expect(stored).toBeNull();
    });
  });

  describe("undo/redo", () => {
    it("should undo and redo changes", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-15", "First")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      act(() => {
        result.current.undo();
      });

      expect(result.current.entries).toHaveLength(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.redo();
      });

      expect(result.current.entries).toHaveLength(1);
      expect(getEvents(result.current.entries)[0]?.title).toBe("First");
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("should clear redo stack after new changes", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([
          createDateEntry("2025-01-15", "First"),
          createDateEntry("2025-01-16", "Second"),
        ]);
      });

      act(() => {
        result.current.undo();
      });

      expect(result.current.entries).toHaveLength(0);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.addEntries([createDateEntry("2025-01-17", "Third")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.canRedo).toBe(false);
    });

    it("should enforce history limit when undoing many changes", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        for (let i = 0; i < 55; i += 1) {
          result.current.addEntries([
            createDateEntry(`2025-02-${String(i + 1).padStart(2, "0")}`, `Event ${i + 1}`),
          ]);
        }
      });

      expect(result.current.entries).toHaveLength(55);

      act(() => {
        for (let i = 0; i < 50; i += 1) {
          result.current.undo();
        }
      });

      expect(result.current.entries).toHaveLength(5);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it("should undo update and delete operations", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createDateEntry("2025-03-10", "Original")]);
      });

      const entryId = result.current.entries[0]?.id;
      expect(entryId).toBeTruthy();

      act(() => {
        result.current.updateEntry(entryId!, createDateEntry("2025-03-11", "Updated", "business"));
      });

      expect(getEvents(result.current.entries)[0]?.title).toBe("Updated");

      act(() => {
        result.current.deleteEntry(entryId!);
      });

      expect(result.current.entries).toHaveLength(0);

      act(() => {
        result.current.undo();
      });

      expect(result.current.entries).toHaveLength(1);
      expect(getEvents(result.current.entries)[0]?.title).toBe("Updated");

      act(() => {
        result.current.undo();
      });

      expect(result.current.entries).toHaveLength(1);
      expect(getEvents(result.current.entries)[0]?.title).toBe("Original");
    });

    it("should support multiple consecutive undos and redos", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([
          createDateEntry("2025-04-01", "Event 1"),
          createDateEntry("2025-04-02", "Event 2"),
          createDateEntry("2025-04-03", "Event 3"),
        ]);
      });

      act(() => {
        result.current.undo();
        result.current.undo();
      });

      expect(result.current.entries).toHaveLength(0);

      act(() => {
        result.current.redo();
      });

      expect(result.current.entries).toHaveLength(3);
      expect(getEvents(result.current.entries)[1]?.title).toBe("Event 2");
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

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(3);
      expect(events[0]?.title).toBe("January event");
      expect(events[1]?.title).toBe("June event");
      expect(events[2]?.title).toBe("Christmas");
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

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(3);
      expect(events[0]?.title).toBe("January event");
      expect(events[1]?.title).toBe("June event");
      expect(events[2]?.title).toBe("Christmas");

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

      const events = getEvents(result.current.entries);
      expect(events).toHaveLength(2);
      expect(events[0]?.type).toBe("range");
      expect(events[0]?.title).toBe("Christmas");
      expect(events[1]?.type).toBe("weekly");
      expect(events[1]?.title).toBe("Monday in office");
    });

    it("should keep range entries as a single canonical entry", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEntries([createRangeEntry("2025-05-01", "2025-05-03", "Long weekend")]);
      });

      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0]?.kind).toBe("range");
      const events = getEvents(result.current.entries);
      expect(events[0]?.start).toBe("2025/05/01");
      expect(events[0]?.end).toBe("2025/05/03");
    });
  });
});
