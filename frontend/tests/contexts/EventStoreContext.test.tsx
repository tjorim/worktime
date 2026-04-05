import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { EventStoreProvider, useEventStore } from "../../src/contexts/EventStoreContext";
import type { HdayEvent } from "../../src/lib/hday/types";

// Wrapper component for testing
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EventStoreProvider>{children}</EventStoreProvider>
);

describe("EventStoreContext", () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe("Initial State", () => {
    it("should start with empty events", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      expect(result.current.events).toEqual([]);
      expect(result.current.rawText).toBe("");
    });

    it("should load events from localStorage if present", () => {
      const testHday = "2025/01/15 # Test event\n";
      localStorage.setItem("worktime_hday_raw", testHday);

      const { result } = renderHook(() => useEventStore(), { wrapper });

      expect(result.current.rawText).toBe(testHday);
      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("Test event");
    });
  });

  describe("addEvent", () => {
    it("should add a new event", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const newEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "New event",
      };

      act(() => {
        result.current.addEvent(newEvent);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("New event");
    });

    it("should persist event to localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const newEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "Persisted event",
      };

      act(() => {
        result.current.addEvent(newEvent);
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      expect(stored).toContain("Persisted event");
      expect(stored).toContain("2025/01/15");
    });

    it("should add weekly event", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const weeklyEvent: HdayEvent = {
        type: "weekly",
        weekday: 1,
        flags: ["in"],
        title: "Every Monday",
      };

      act(() => {
        result.current.addEvent(weeklyEvent);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].type).toBe("weekly");
      expect(result.current.events[0].weekday).toBe(1);
    });
  });

  describe("updateEvent", () => {
    it("should update an existing event", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const initialEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "Original",
      };

      act(() => {
        result.current.addEvent(initialEvent);
      });

      const updatedEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["business"],
        title: "Updated",
      };

      act(() => {
        result.current.updateEvent(0, updatedEvent);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("Updated");
      expect(result.current.events[0].flags).toEqual(["business"]);
    });

    it("should persist update to localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      const initialEvent: HdayEvent = {
        type: "range",
        start: "2025/01/15",
        end: "2025/01/15",
        flags: ["holiday"],
        title: "Original",
      };

      act(() => {
        result.current.addEvent(initialEvent);
      });

      const updatedEvent: HdayEvent = {
        type: "range",
        start: "2025/01/20",
        end: "2025/01/20",
        flags: ["business"],
        title: "Updated",
      };

      act(() => {
        result.current.updateEvent(0, updatedEvent);
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      expect(stored).toContain("Updated");
      expect(stored).toContain("2025/01/20");
      expect(stored).not.toContain("Original");
    });
  });

  describe("deleteEvent", () => {
    it("should delete an event by index", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "Event 1",
        });
        result.current.addEvent({
          type: "range",
          start: "2025/01/16",
          end: "2025/01/16",
          flags: ["holiday"],
          title: "Event 2",
        });
      });

      expect(result.current.events).toHaveLength(2);

      act(() => {
        result.current.deleteEvent(0);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("Event 2");
    });

    it("should persist deletion to localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "To be deleted",
        });
      });

      act(() => {
        result.current.deleteEvent(0);
      });

      const stored = localStorage.getItem("worktime_hday_raw");
      // When all events are deleted, key is removed from localStorage
      expect(stored).toBeNull();
    });
  });

  describe("deleteEvents", () => {
    it("should delete multiple events by index", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "Event 1",
        });
        result.current.addEvent({
          type: "range",
          start: "2025/01/16",
          end: "2025/01/16",
          flags: ["holiday"],
          title: "Event 2",
        });
        result.current.addEvent({
          type: "range",
          start: "2025/01/17",
          end: "2025/01/17",
          flags: ["holiday"],
          title: "Event 3",
        });
      });

      act(() => {
        result.current.deleteEvents([0, 2]);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("Event 2");
    });
  });

  describe("getEventsInRange", () => {
    it("should return events within the date range", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "Event in range",
        });
        result.current.addEvent({
          type: "range",
          start: "2025/02/15",
          end: "2025/02/15",
          flags: ["holiday"],
          title: "Event out of range",
        });
      });

      const rangeEvents = result.current.getEventsInRange(
        new Date("2025-01-01"),
        new Date("2025-01-31"),
      );

      expect(rangeEvents).toHaveLength(1);
      expect(rangeEvents[0].label).toBe("Event in range");
    });

    it("should expand weekly events within range", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "weekly",
          weekday: 1, // Monday
          flags: ["in"],
          title: "Every Monday",
        });
      });

      // January 2025: Mondays are 6, 13, 20, 27
      const rangeEvents = result.current.getEventsInRange(
        new Date("2025-01-01"),
        new Date("2025-01-31"),
      );

      expect(rangeEvents).toHaveLength(4);
      rangeEvents.forEach((event) => {
        expect(event.label).toBe("Every Monday");
      });
    });

    it("should return empty array when no events in range", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/12/25",
          end: "2025/12/25",
          flags: ["holiday"],
          title: "Christmas",
        });
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

      expect(result.current.events).toHaveLength(3);
      expect(result.current.events[0].title).toBe("Event 1");
      expect(result.current.events[1].title).toBe("Event 2");
      expect(result.current.events[2].type).toBe("weekly");
    });

    it("should replace existing events on import", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/01",
          end: "2025/01/01",
          flags: ["holiday"],
          title: "Old event",
        });
      });

      const hdayContent = "2025/01/15 # New event\n";

      act(() => {
        result.current.importHday(hdayContent);
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("New event");
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
    it("should clear all events", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "Event to clear",
        });
      });

      expect(result.current.events).toHaveLength(1);

      act(() => {
        result.current.clearAll();
      });

      expect(result.current.events).toHaveLength(0);
      expect(result.current.rawText).toBe("");
    });

    it("should remove data from localStorage", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "Event to clear",
        });
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
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "First",
        });
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);

      act(() => {
        result.current.undo();
      });

      expect(result.current.events).toHaveLength(0);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.redo();
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("First");
      expect(result.current.canUndo).toBe(true);
      expect(result.current.canRedo).toBe(false);
    });

    it("should clear redo stack after new changes", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "First",
        });
        result.current.addEvent({
          type: "range",
          start: "2025/01/16",
          end: "2025/01/16",
          flags: ["holiday"],
          title: "Second",
        });
      });

      act(() => {
        result.current.undo();
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.canRedo).toBe(true);

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/17",
          end: "2025/01/17",
          flags: ["holiday"],
          title: "Third",
        });
      });

      expect(result.current.events).toHaveLength(2);
      expect(result.current.canRedo).toBe(false);
    });

    it("should enforce history limit when undoing many changes", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        for (let i = 0; i < 55; i += 1) {
          result.current.addEvent({
            type: "range",
            start: `2025/02/${String(i + 1).padStart(2, "0")}`,
            end: `2025/02/${String(i + 1).padStart(2, "0")}`,
            flags: ["holiday"],
            title: `Event ${i + 1}`,
          });
        }
      });

      expect(result.current.events).toHaveLength(55);

      act(() => {
        for (let i = 0; i < 50; i += 1) {
          result.current.undo();
        }
      });

      expect(result.current.events).toHaveLength(5);
      expect(result.current.canUndo).toBe(false);
      expect(result.current.canRedo).toBe(true);
    });

    it("should undo update and delete operations", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/03/10",
          end: "2025/03/10",
          flags: ["holiday"],
          title: "Original",
        });
      });

      act(() => {
        result.current.updateEvent(0, {
          type: "range",
          start: "2025/03/11",
          end: "2025/03/11",
          flags: ["business"],
          title: "Updated",
        });
      });

      expect(result.current.events[0].title).toBe("Updated");

      act(() => {
        result.current.deleteEvent(0);
      });

      expect(result.current.events).toHaveLength(0);

      act(() => {
        result.current.undo();
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("Updated");

      act(() => {
        result.current.undo();
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("Original");
    });

    it("should support multiple consecutive undos and redos", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/04/01",
          end: "2025/04/01",
          flags: ["holiday"],
          title: "Event 1",
        });
        result.current.addEvent({
          type: "range",
          start: "2025/04/02",
          end: "2025/04/02",
          flags: ["holiday"],
          title: "Event 2",
        });
        result.current.addEvent({
          type: "range",
          start: "2025/04/03",
          end: "2025/04/03",
          flags: ["holiday"],
          title: "Event 3",
        });
      });

      act(() => {
        result.current.undo();
        result.current.undo();
      });

      expect(result.current.events).toHaveLength(1);
      expect(result.current.events[0].title).toBe("Event 1");

      act(() => {
        result.current.redo();
      });

      expect(result.current.events).toHaveLength(2);
      expect(result.current.events[1].title).toBe("Event 2");
    });
  });

  describe("Event Sorting", () => {
    it("should sort range events by starting date", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      // Add events in reverse chronological order
      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/12/25",
          end: "2025/12/25",
          flags: ["holiday"],
          title: "Christmas",
        });
      });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/01/15",
          end: "2025/01/15",
          flags: ["holiday"],
          title: "January event",
        });
      });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/06/10",
          end: "2025/06/10",
          flags: ["holiday"],
          title: "June event",
        });
      });

      // Events should be sorted by start date (earliest first)
      expect(result.current.events).toHaveLength(3);
      expect(result.current.events[0].title).toBe("January event");
      expect(result.current.events[1].title).toBe("June event");
      expect(result.current.events[2].title).toBe("Christmas");
    });

    it("should maintain sort order after importing raw .hday content", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      // Import unsorted .hday content
      const unsortedHday = `2025/12/25 # Christmas
2025/01/15 # January event
2025/06/10 # June event
`;

      act(() => {
        result.current.importHday(unsortedHday);
      });

      // Events should be sorted by start date
      expect(result.current.events).toHaveLength(3);
      expect(result.current.events[0].title).toBe("January event");
      expect(result.current.events[1].title).toBe("June event");
      expect(result.current.events[2].title).toBe("Christmas");

      // Raw text should reflect sorted order
      expect(result.current.rawText).toContain("2025/01/15");
      expect(result.current.rawText.indexOf("2025/01/15")).toBeLessThan(
        result.current.rawText.indexOf("2025/06/10"),
      );
      expect(result.current.rawText.indexOf("2025/06/10")).toBeLessThan(
        result.current.rawText.indexOf("2025/12/25"),
      );
    });

    it("should sort range events before weekly events", () => {
      const { result } = renderHook(() => useEventStore(), { wrapper });

      act(() => {
        result.current.addEvent({
          type: "weekly",
          weekday: 1,
          flags: ["in"],
          title: "Monday in office",
        });
      });

      act(() => {
        result.current.addEvent({
          type: "range",
          start: "2025/12/25",
          end: "2025/12/25",
          flags: ["holiday"],
          title: "Christmas",
        });
      });

      // Range events should come before weekly events
      expect(result.current.events).toHaveLength(2);
      expect(result.current.events[0].type).toBe("range");
      expect(result.current.events[0].title).toBe("Christmas");
      expect(result.current.events[1].type).toBe("weekly");
      expect(result.current.events[1].title).toBe("Monday in office");
    });
  });
});
