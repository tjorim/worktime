/**
 * Event Store Context
 *
 * Manages canonical time-off entries with CRUD operations, import/export helpers,
 * undo/redo history, and localStorage persistence.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import type { CalendarEvent } from "../lib/events/types";
import { entriesToCalendarEvents, filterEventsInRange } from "../lib/events/converters";
import { parseHday } from "../lib/hday/parser";
import type { HdayEvent } from "../lib/hday/types";
import {
  buildTimeOffEntryForRange,
  createWeeklyTimeOffEntry,
  getEntryTimeFlagsFromDisplayFlags,
  getEntryTypeFromDisplayFlags,
  hdayToTimeOffEntries,
  timeOffEntriesToHday,
} from "../lib/timeOff/codecs";
import {
  LEGACY_TIME_OFF_STORAGE_KEY,
  loadTimeOffEntries,
  saveTimeOffEntries,
} from "../lib/timeOff/storage";
import type { TimeOffEntry } from "../lib/timeOff/types";
import type { TimeOffImportResult } from "../lib/timeOff/types";
import {
  getTimeOffEntryIdentityKey,
  getTimeOffEntrySortKey,
} from "../lib/timeOff/types";
import { dayjs } from "../utils/dateTimeUtils";

export const TIME_OFF_STORAGE_KEY = LEGACY_TIME_OFF_STORAGE_KEY;

type EventStoreAction =
  | { type: "ADD_ENTRIES"; payload: TimeOffEntry[] }
  | { type: "REPLACE_ENTRIES"; payload: TimeOffEntry[] }
  | { type: "UPDATE_ENTRY"; payload: { id: string; entry: TimeOffEntry } }
  | { type: "DELETE_ENTRY"; payload: string }
  | { type: "DELETE_ENTRIES"; payload: string[] }
  | { type: "IMPORT_HDAY"; payload: string }
  | { type: "CLEAR_ALL" }
  | { type: "UNDO" }
  | { type: "REDO" };

interface EventStoreState {
  entries: TimeOffEntry[];
  history: TimeOffEntry[][];
  future: TimeOffEntry[][];
}

interface EventStoreContextType {
  rawText: string;
  entries: TimeOffEntry[];
  events: HdayEvent[];
  getEventsInRange: (startDate: Date, endDate: Date) => CalendarEvent[];
  addEvent: (event: HdayEvent) => void;
  addEntries: (entries: TimeOffEntry[]) => void;
  replaceEntries: (entries: TimeOffEntry[]) => void;
  updateEvent: (index: number, event: HdayEvent) => void;
  updateEntry: (id: string, entry: TimeOffEntry) => void;
  deleteEvent: (index: number) => void;
  deleteEntry: (id: string | number) => void;
  deleteEntries: (ids: string[] | number[]) => void;
  deleteEvents: (ids: string[] | number[]) => void;
  importHday: (text: string) => TimeOffImportResult;
  clearAll: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
}

const EventStoreContext = createContext<EventStoreContextType | undefined>(undefined);

interface EventStoreProviderProps {
  children: ReactNode;
}

const HISTORY_LIMIT = 50;

function eventToEntries(event: HdayEvent): TimeOffEntry[] {
  const entryType = getEntryTypeFromDisplayFlags(event.flags ?? []);
  const flags = getEntryTimeFlagsFromDisplayFlags(event.flags ?? []);

  if (event.type === "weekly") {
    if (!event.weekday) {
      return [];
    }

    return [
      createWeeklyTimeOffEntry({
        weekday: event.weekday,
        note: event.title,
        entryType,
        flags,
      }),
    ];
  }

  if (!event.start) {
    return [];
  }

  return [
    buildTimeOffEntryForRange({
      start: event.start.replace(/\//g, "-"),
      end: (event.end ?? event.start).replace(/\//g, "-"),
      note: event.title,
      entryType,
      flags,
    }),
  ];
}

function getMatchingEntryIds(entries: TimeOffEntry[], event: HdayEvent): string[] {
  const identityKeys = new Set(eventToEntries(event).map((entry) => getTimeOffEntryIdentityKey(entry)));
  return entries
    .filter((entry) => identityKeys.has(getTimeOffEntryIdentityKey(entry)))
    .map((entry) => entry.id);
}

function sortEntries(entries: TimeOffEntry[]): TimeOffEntry[] {
  return [...entries].sort((a, b) => {
    const byKey = getTimeOffEntrySortKey(a).localeCompare(getTimeOffEntrySortKey(b));
    if (byKey !== 0) return byKey;
    const byIdentity = getTimeOffEntryIdentityKey(a).localeCompare(getTimeOffEntryIdentityKey(b));
    if (byIdentity !== 0) return byIdentity;
    return a.id.localeCompare(b.id);
  });
}

function mergeEntries(currentEntries: TimeOffEntry[], nextEntries: TimeOffEntry[]): TimeOffEntry[] {
  const byKey = new Map(currentEntries.map((entry) => [getTimeOffEntryIdentityKey(entry), entry]));
  for (const entry of nextEntries) {
    const identityKey = getTimeOffEntryIdentityKey(entry);
    const previous = byKey.get(identityKey);
    byKey.set(identityKey, previous ? { ...entry, id: previous.id } : entry);
  }
  return sortEntries(Array.from(byKey.values()));
}

function applyWithHistory(state: EventStoreState, nextEntries: TimeOffEntry[]): EventStoreState {
  if (nextEntries === state.entries) {
    return state;
  }

  return {
    entries: nextEntries,
    history: [...state.history, state.entries].slice(-HISTORY_LIMIT),
    future: [],
  };
}

function entriesReducer(state: EventStoreState, action: EventStoreAction): EventStoreState {
  switch (action.type) {
    case "ADD_ENTRIES":
      return applyWithHistory(state, mergeEntries(state.entries, action.payload));

    case "REPLACE_ENTRIES":
      return applyWithHistory(state, sortEntries(action.payload));

    case "UPDATE_ENTRY": {
      const { id, entry } = action.payload;
      if (!state.entries.some((currentEntry) => currentEntry.id === id)) {
        console.error(`Invalid entry id: ${id}`);
        return state;
      }

      const filteredEntries = state.entries.filter(
        (currentEntry) =>
          currentEntry.id !== id &&
          getTimeOffEntryIdentityKey(currentEntry) !== getTimeOffEntryIdentityKey(entry),
      );
      return applyWithHistory(state, sortEntries([...filteredEntries, { ...entry, id }]));
    }

    case "DELETE_ENTRY": {
      if (!state.entries.some((entry) => entry.id === action.payload)) {
        console.error(`Invalid entry id: ${action.payload}`);
        return state;
      }
      return applyWithHistory(
        state,
        state.entries.filter((entry) => entry.id !== action.payload),
      );
    }

    case "DELETE_ENTRIES": {
      if (action.payload.length === 0) {
        return state;
      }
      const ids = new Set(action.payload);
      const filteredEntries = state.entries.filter((entry) => !ids.has(entry.id));
      if (filteredEntries.length === state.entries.length) {
        console.error("Invalid entry ids:", action.payload);
        return state;
      }
      return applyWithHistory(state, filteredEntries);
    }

    case "IMPORT_HDAY": {
      const result = hdayToTimeOffEntries(action.payload);
      return applyWithHistory(state, sortEntries(result.entries));
    }

    case "CLEAR_ALL":
      if (state.entries.length === 0) return state;
      return applyWithHistory(state, []);

    case "UNDO": {
      if (state.history.length === 0) {
        return state;
      }
      const previous = state.history[state.history.length - 1];
      if (!previous) return state;
      return {
        entries: previous,
        history: state.history.slice(0, -1),
        future: [state.entries, ...state.future],
      };
    }

    case "REDO": {
      if (state.future.length === 0) {
        return state;
      }
      const [next, ...remaining] = state.future;
      if (!next) return state;
      return {
        entries: next,
        history: [...state.history, state.entries].slice(-HISTORY_LIMIT),
        future: remaining,
      };
    }

    default:
      return state;
  }
}

export function EventStoreProvider({ children }: EventStoreProviderProps) {
  const [state, dispatch] = useReducer(
    entriesReducer,
    undefined,
    () => ({
      entries: loadTimeOffEntries(),
      history: [],
      future: [],
    }),
  );

  const rawText = useMemo(() => {
    if (state.entries.length === 0) return "";
    try {
      return `${timeOffEntriesToHday(state.entries)}\n`;
    } catch (error) {
      console.error("Failed to serialize time-off entries:", error);
      return "";
    }
  }, [state.entries]);

  useEffect(() => {
    try {
      saveTimeOffEntries(state.entries);
    } catch (error) {
      console.error("Failed to save time-off entries to localStorage:", error);
    }
  }, [state.entries]);

  const getEventsInRange = useCallback(
    (startDate: Date, endDate: Date): CalendarEvent[] => {
      const calendarEvents = entriesToCalendarEvents(state.entries);
      const startStr = dayjs(startDate).format("YYYY-MM-DD");
      const endStr = dayjs(endDate).format("YYYY-MM-DD");
      return filterEventsInRange(calendarEvents, startStr, endStr);
    },
    [state.entries],
  );

  const addEntries = useCallback((entries: TimeOffEntry[]) => {
    dispatch({ type: "ADD_ENTRIES", payload: entries });
  }, []);

  const addEvent = useCallback(
    (event: HdayEvent) => {
      addEntries(eventToEntries(event));
    },
    [addEntries],
  );

  const replaceEntries = useCallback((entries: TimeOffEntry[]) => {
    dispatch({ type: "REPLACE_ENTRIES", payload: entries });
  }, []);

  const updateEntry = useCallback((id: string, entry: TimeOffEntry) => {
    dispatch({ type: "UPDATE_ENTRY", payload: { id, entry } });
  }, []);

  const events = useMemo(() => (rawText.trim() ? parseHday(rawText) : []), [rawText]);

  const updateEvent = useCallback(
    (index: number, event: HdayEvent) => {
      const currentEvent = events[index];
      if (!currentEvent) {
        console.error(`Invalid event index: ${index}`);
        return;
      }

      const currentIds = new Set(getMatchingEntryIds(state.entries, currentEvent));
      const nextEntries = eventToEntries(event);
      if (currentIds.size === 0 || nextEntries.length === 0) {
        console.error(`Invalid event update at index: ${index}`);
        return;
      }

      if (nextEntries.length === 1) {
        const [firstId] = Array.from(currentIds);
        if (firstId) {
          updateEntry(firstId, nextEntries[0]!);
          return;
        }
      }

      const nextIdentityKeys = new Set(nextEntries.map((entry) => getTimeOffEntryIdentityKey(entry)));
      replaceEntries([
        ...state.entries.filter(
          (entry) =>
            !currentIds.has(entry.id) && !nextIdentityKeys.has(getTimeOffEntryIdentityKey(entry)),
        ),
        ...nextEntries,
      ]);
    },
    [events, replaceEntries, state.entries, updateEntry],
  );

  const deleteEntry = useCallback(
    (id: string | number) => {
      if (typeof id === "number") {
        const resolvedId = state.entries[id]?.id;
        if (!resolvedId) {
          console.error(`Invalid entry identifier: ${id}`);
          return;
        }
        dispatch({ type: "DELETE_ENTRY", payload: resolvedId });
        return;
      }

      const groupedEvent = events.find((event) => getMatchingEntryIds(state.entries, event).includes(id));
      const groupedIds = groupedEvent ? getMatchingEntryIds(state.entries, groupedEvent) : [id];
      if (groupedIds.length === 0) {
        console.error(`Invalid entry identifier: ${id}`);
        return;
      }
      if (groupedIds.length === 1) {
        dispatch({ type: "DELETE_ENTRY", payload: groupedIds[0]! });
        return;
      }
      dispatch({ type: "DELETE_ENTRIES", payload: groupedIds });
    },
    [events, state.entries],
  );

  const deleteEntries = useCallback(
    (ids: string[] | number[]) => {
      const resolvedIds = ids
        .flatMap((id) => {
          if (typeof id === "number") {
            const currentEvent = events[id];
            return currentEvent ? getMatchingEntryIds(state.entries, currentEvent) : [];
          }
          return [id];
        })
        .filter((id, index, allIds): id is string => typeof id === "string" && allIds.indexOf(id) === index);
      dispatch({ type: "DELETE_ENTRIES", payload: resolvedIds });
    },
    [events, state.entries],
  );

  const deleteEvent = useCallback(
    (index: number) => {
      const currentEvent = events[index];
      if (!currentEvent) {
        console.error(`Invalid event index: ${index}`);
        return;
      }
      deleteEntries(getMatchingEntryIds(state.entries, currentEvent));
    },
    [deleteEntries, events, state.entries],
  );

  const importHday = useCallback((text: string) => {
    const result = hdayToTimeOffEntries(text);
    dispatch({ type: "IMPORT_HDAY", payload: text });
    return result;
  }, []);

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
      entries: state.entries,
      events,
      getEventsInRange,
      addEvent,
      addEntries,
      replaceEntries,
      updateEvent,
      updateEntry,
      deleteEvent,
      deleteEntry,
      deleteEntries,
      deleteEvents: deleteEntries,
      importHday,
      clearAll,
      canUndo: state.history.length > 0,
      canRedo: state.future.length > 0,
      undo,
      redo,
    }),
    [
      rawText,
      state.entries,
      events,
      getEventsInRange,
      addEvent,
      addEntries,
      replaceEntries,
      updateEvent,
      updateEntry,
      deleteEvent,
      deleteEntry,
      deleteEntries,
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

export function useEventStore(): EventStoreContextType {
  const context = useContext(EventStoreContext);
  if (context === undefined) {
    throw new Error("useEventStore must be used within an EventStoreProvider");
  }
  return context;
}
