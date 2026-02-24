/**
 * Event Store Context
 *
 * Manages time-off events from .hday files with CRUD operations and localStorage persistence.
 * Provides a centralized store for holiday/time-off events across the application.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import type { HdayEvent } from "../lib/hday/types";
import { parseHday, sortEvents, toLine } from "../lib/hday/parser";
import { hdayToCalendarEvents, filterEventsInRange } from "../lib/events/converters";
import type { CalendarEvent } from "../lib/events/types";
import { dayjs } from "../utils/dateTimeUtils";

export const TIME_OFF_STORAGE_KEY = "worktime_hday_raw";

/**
 * Action types for event store reducer
 */
type EventStoreAction =
  | { type: "ADD_EVENT"; payload: HdayEvent }
  | { type: "UPDATE_EVENT"; payload: { index: number; event: HdayEvent } }
  | { type: "DELETE_EVENT"; payload: number }
  | { type: "DELETE_EVENTS"; payload: number[] }
  | { type: "IMPORT_HDAY"; payload: string }
  | { type: "CLEAR_ALL" }
  | { type: "UNDO" }
  | { type: "REDO" };

interface EventStoreState {
  events: HdayEvent[];
  history: HdayEvent[][];
  future: HdayEvent[][];
}

interface EventStoreContextType {
  /** Raw .hday text content */
  rawText: string;

  /** Parsed .hday events */
  events: HdayEvent[];

  /** Get calendar events within a date range */
  getEventsInRange: (startDate: Date, endDate: Date) => CalendarEvent[];

  /** Add a new event */
  addEvent: (event: HdayEvent) => void;

  /** Update an existing event by index */
  updateEvent: (index: number, event: HdayEvent) => void;

  /** Delete an event by index */
  deleteEvent: (index: number) => void;

  /** Delete multiple events by index */
  deleteEvents: (indices: number[]) => void;

  /** Import .hday text (replaces all events) */
  importHday: (text: string) => void;

  /** Clear all events */
  clearAll: () => void;

  /** Whether there is history to undo */
  canUndo: boolean;

  /** Whether there is history to redo */
  canRedo: boolean;

  /** Undo the last event change */
  undo: () => void;

  /** Redo the last undone change */
  redo: () => void;
}

const EventStoreContext = createContext<EventStoreContextType | undefined>(undefined);

interface EventStoreProviderProps {
  children: ReactNode;
}

/**
 * Apply an EventStoreAction to the current events array and produce the updated events array.
 *
 * @param state - Current array of HdayEvent objects
 * @param action - Action describing the mutation to perform (ADD_EVENT, UPDATE_EVENT, DELETE_EVENT, IMPORT_HDAY, CLEAR_ALL)
 * @returns The updated HdayEvent array after applying the action; returns the original `state` for unknown actions or when an invalid index is provided
 */
const HISTORY_LIMIT = 50;

function applyWithHistory(state: EventStoreState, nextEvents: HdayEvent[]): EventStoreState {
  if (nextEvents === state.events) {
    return state;
  }

  const nextHistory = [...state.history, state.events].slice(-HISTORY_LIMIT);
  return {
    events: nextEvents,
    history: nextHistory,
    future: [],
  };
}

function eventsReducer(state: EventStoreState, action: EventStoreAction): EventStoreState {
  switch (action.type) {
    case "ADD_EVENT": {
      const newEvents = sortEvents([...state.events, action.payload]);
      return applyWithHistory(state, newEvents);
    }

    case "UPDATE_EVENT": {
      const { index, event } = action.payload;
      if (index < 0 || index >= state.events.length) {
        console.error(`Invalid event index: ${index}`);
        return state;
      }
      const newEvents = [...state.events];
      newEvents[index] = event;
      return applyWithHistory(state, sortEvents(newEvents));
    }

    case "DELETE_EVENT": {
      if (action.payload < 0 || action.payload >= state.events.length) {
        console.error(`Invalid event index: ${action.payload}`);
        return state;
      }
      const filtered = state.events.filter((_, i) => i !== action.payload);
      return applyWithHistory(state, sortEvents(filtered));
    }

    case "DELETE_EVENTS": {
      if (action.payload.length === 0) {
        return state;
      }
      const indices = new Set(
        action.payload.filter((index) => index >= 0 && index < state.events.length),
      );
      if (indices.size === 0) {
        console.error("Invalid event indices:", action.payload);
        return state;
      }
      const filtered = state.events.filter((_, i) => !indices.has(i));
      return applyWithHistory(state, sortEvents(filtered));
    }

    case "IMPORT_HDAY": {
      const parsed = action.payload.trim() ? parseHday(action.payload) : [];
      return applyWithHistory(state, sortEvents(parsed));
    }

    case "CLEAR_ALL": {
      if (state.events.length === 0) {
        return state;
      }
      return applyWithHistory(state, []);
    }

    case "UNDO": {
      if (state.history.length === 0) {
        return state;
      }
      const previous = state.history[state.history.length - 1];
      if (!previous) {
        return state;
      }
      return {
        events: previous,
        history: state.history.slice(0, -1),
        future: [state.events, ...state.future],
      };
    }

    case "REDO": {
      if (state.future.length === 0) {
        return state;
      }
      const [next, ...remaining] = state.future;
      if (!next) {
        return state;
      }
      return {
        events: next,
        history: [...state.history, state.events].slice(-HISTORY_LIMIT),
        future: remaining,
      };
    }

    default:
      return state;
  }
}

/**
 * Provides a React context for storing and managing .hday time-off events with localStorage persistence.
 *
 * The provider initialises events from localStorage, keeps a serialised `.hday` representation in sync,
 * and exposes CRUD, import/export and range-query operations via the EventStoreContext.
 *
 * @param children - React children that will receive the event store context
 * @returns The provider element that supplies the event store context to its descendants
 */
export function EventStoreProvider({ children }: EventStoreProviderProps) {
  // Load and parse events from localStorage on mount (parse once, managed by reducer)
  const [state, dispatch] = useReducer(
    eventsReducer,
    { events: [], history: [], future: [] },
    () => {
      if (typeof window === "undefined") {
        return { events: [], history: [], future: [] };
      }
      try {
        const stored = localStorage.getItem(TIME_OFF_STORAGE_KEY) || "";
        return {
          events: stored.trim() ? parseHday(stored) : [],
          history: [],
          future: [],
        };
      } catch (error) {
        console.error("Failed to load .hday content from localStorage:", error);
        return { events: [], history: [], future: [] };
      }
    },
  );

  // Derive raw text from events (for export and backward compatibility)
  const rawText = useMemo(() => {
    if (state.events.length === 0) return "";
    try {
      return state.events.map((e) => toLine(e)).join("\n") + "\n";
    } catch (error) {
      console.error("Failed to serialize events:", error);
      return "";
    }
  }, [state.events]);

  // Persist to localStorage whenever events change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (rawText) {
        localStorage.setItem(TIME_OFF_STORAGE_KEY, rawText);
      } else {
        localStorage.removeItem(TIME_OFF_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Failed to save .hday content to localStorage:", error);
    }
  }, [rawText]);

  /**
   * Get calendar events within a date range
   */
  const getEventsInRange = useCallback(
    (startDate: Date, endDate: Date): CalendarEvent[] => {
      const calendarEvents: CalendarEvent[] = [];

      state.events.forEach((event, index) => {
        const converted = hdayToCalendarEvents(event, startDate, endDate, index);
        calendarEvents.push(...converted);
      });

      // Filter to only include events that overlap with the date range
      const startStr = dayjs(startDate).format("YYYY-MM-DD");
      const endStr = dayjs(endDate).format("YYYY-MM-DD");
      return filterEventsInRange(calendarEvents, startStr, endStr);
    },
    [state.events],
  );

  /**
   * Add a new event
   */
  const addEvent = useCallback((event: HdayEvent) => {
    dispatch({ type: "ADD_EVENT", payload: event });
  }, []);

  /**
   * Update an existing event by index
   */
  const updateEvent = useCallback((index: number, event: HdayEvent) => {
    dispatch({ type: "UPDATE_EVENT", payload: { index, event } });
  }, []);

  /**
   * Delete an event by index
   */
  const deleteEvent = useCallback((index: number) => {
    dispatch({ type: "DELETE_EVENT", payload: index });
  }, []);

  const deleteEvents = useCallback((indices: number[]) => {
    dispatch({ type: "DELETE_EVENTS", payload: indices });
  }, []);

  /**
   * Import .hday text (replaces all events)
   */
  const importHday = useCallback((text: string) => {
    dispatch({ type: "IMPORT_HDAY", payload: text });
  }, []);

  /**
   * Clear all events
   */
  const clearAll = useCallback(() => {
    dispatch({ type: "CLEAR_ALL" });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "UNDO" });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "REDO" });
  }, []);

  const contextValue: EventStoreContextType = useMemo(
    () => ({
      rawText,
      events: state.events,
      getEventsInRange,
      addEvent,
      updateEvent,
      deleteEvent,
      deleteEvents,
      importHday,
      clearAll,
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      undo,
      redo,
    }),
    [
      rawText,
      state.events,
      getEventsInRange,
      addEvent,
      updateEvent,
      deleteEvent,
      deleteEvents,
      importHday,
      clearAll,
      state.history.length,
      state.future.length,
      undo,
      redo,
    ],
  );

  return <EventStoreContext.Provider value={contextValue}>{children}</EventStoreContext.Provider>;
}

/**
 * Hook to access event store context
 * Must be used within an EventStoreProvider
 *
 * @returns The EventStoreContextType with all event store operations
 * @throws {Error} If used outside of an EventStoreProvider
 */
export function useEventStore(): EventStoreContextType {
  const context = useContext(EventStoreContext);
  if (context === undefined) {
    throw new Error("useEventStore must be used within an EventStoreProvider");
  }
  return context;
}
