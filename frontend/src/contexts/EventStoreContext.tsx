/**
 * Event Store Context
 *
 * Manages canonical time-off entries with CRUD operations, import/export helpers,
 * undo/redo history, and TanStack DB collection backing (timeOffCollection).
 *
 * Entries are stored in and read from `timeOffCollection` (a QueryCollection
 * wired to the sync pull/push endpoints). Undo/redo history is tracked
 * separately as a stack of entry snapshots; undoing applies the diff back to
 * the collection so the server stays in sync.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useReducer, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import type { CalendarEvent } from "@/lib/events/types";
import { entriesToCalendarEvents, filterEventsInRange } from "@/lib/events/converters";
import { hdayToTimeOffEntries, timeOffEntriesToHday } from "@/lib/timeOff/codecs";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import type { TimeOffImportResult } from "@/lib/timeOff/types";
import { getTimeOffEntryIdentityKey, getTimeOffEntrySortKey } from "@/lib/timeOff/types";
import { dayjs } from "@/utils/dateTimeUtils";
import { hasSyncCollectionAuth, timeOffCollection } from "@/db/collections";

interface EventStoreContextType {
  rawText: string;
  entries: TimeOffEntry[];
  getEventsInRange: (startDate: Date, endDate: Date) => CalendarEvent[];
  addEntries: (entries: TimeOffEntry[]) => void;
  replaceEntries: (entries: TimeOffEntry[]) => void;
  updateEntry: (id: string, entry: TimeOffEntry) => void;
  deleteEntry: (id: string) => void;
  deleteEntries: (ids: string[]) => void;
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

function sortEntries(entries: TimeOffEntry[]): TimeOffEntry[] {
  return [...entries].sort((a, b) => {
    const byKey = getTimeOffEntrySortKey(a).localeCompare(getTimeOffEntrySortKey(b));
    if (byKey !== 0) return byKey;
    const byIdentity = getTimeOffEntryIdentityKey(a).localeCompare(getTimeOffEntryIdentityKey(b));
    if (byIdentity !== 0) return byIdentity;
    return a.id.localeCompare(b.id);
  });
}

function cloneEntries(entries: TimeOffEntry[]): TimeOffEntry[] {
  return entries.map((entry) => structuredClone(entry));
}

/**
 * Apply a snapshot of entries to `timeOffCollection` using normal mutations so
 * that the diff is pushed to the server (undo/redo are synchronised across
 * devices).
 */
function applySnapshotToCollection(current: TimeOffEntry[], target: TimeOffEntry[]): void {
  const currentMap = new Map(current.map((e) => [e.id, e]));
  const targetMap = new Map(target.map((e) => [e.id, e]));
  const collectionIds = new Set((timeOffCollection.toArray as TimeOffEntry[]).map((e) => e.id));

  // Delete entries present in current but absent from target
  const toDelete = [...currentMap.keys()].filter((id) => !targetMap.has(id));
  for (const id of toDelete) {
    if (collectionIds.has(id)) {
      timeOffCollection.delete(id);
    }
  }

  // Insert entries present in target but absent from current
  for (const entry of target) {
    if (!collectionIds.has(entry.id)) {
      timeOffCollection.insert(entry);
    } else {
      // Update entries that exist in both (always push to keep server in sync)
      timeOffCollection.update(entry.id, (d) => {
        Object.assign(d, entry);
      });
    }
  }
}

function writeLocalSnapshot(current: TimeOffEntry[], target: TimeOffEntry[]): void {
  const targetIds = new Set(target.map((entry) => entry.id));
  const toDelete = current.map((entry) => entry.id).filter((id) => !targetIds.has(id));
  timeOffCollection.utils.writeBatch(() => {
    if (toDelete.length > 0) {
      timeOffCollection.utils.writeDelete(toDelete);
    }
    if (target.length > 0) {
      timeOffCollection.utils.writeUpsert(target);
    }
  });
}

export function EventStoreProvider({ children }: EventStoreProviderProps) {
  // Live entries from the collection — always reflects the latest server + local state
  const { data: rawCollectionData } = useLiveQuery(timeOffCollection);
  const sortedEntries = useMemo(
    () => sortEntries((rawCollectionData ?? []) as TimeOffEntry[]),
    [rawCollectionData],
  );

  // Undo / redo stacks (snapshots; no server sync for the stacks themselves)
  const [historyStack, setHistoryStack] = useReducer(
    (_: TimeOffEntry[][], next: TimeOffEntry[][]): TimeOffEntry[][] => next,
    [],
  );
  const [futureStack, setFutureStack] = useReducer(
    (_: TimeOffEntry[][], next: TimeOffEntry[][]): TimeOffEntry[][] => next,
    [],
  );

  // Stable refs so callbacks don't need to list the live arrays as deps
  const sortedEntriesRef = useRef<TimeOffEntry[]>(sortedEntries);
  const historyRef = useRef<TimeOffEntry[][]>(historyStack);
  const futureRef = useRef<TimeOffEntry[][]>(futureStack);
  sortedEntriesRef.current = sortedEntries;
  historyRef.current = historyStack;
  futureRef.current = futureStack;

  const commitHistory = useCallback((next: TimeOffEntry[][]) => {
    historyRef.current = next;
    setHistoryStack(next);
  }, []);

  const commitFuture = useCallback((next: TimeOffEntry[][]) => {
    futureRef.current = next;
    setFutureStack(next);
  }, []);

  // Snapshot current entries onto the undo stack and clear the redo stack
  const pushUndo = useCallback((snapshot: TimeOffEntry[] = cloneEntries(sortedEntriesRef.current)) => {
    commitHistory([...historyRef.current, snapshot].slice(-HISTORY_LIMIT));
    commitFuture([]);
  }, [commitFuture, commitHistory]);

  const rawText = useMemo(() => {
    if (sortedEntries.length === 0) return "";
    try {
      return `${timeOffEntriesToHday(sortedEntries)}\n`;
    } catch (error) {
      console.error("Failed to serialize time-off entries:", error);
      return "";
    }
  }, [sortedEntries]);

  const getEventsInRange = useCallback(
    (startDate: Date, endDate: Date): CalendarEvent[] => {
      const startStr = dayjs(startDate).format("YYYY-MM-DD");
      const endStr = dayjs(endDate).format("YYYY-MM-DD");
      // Use ref to avoid recreating the callback on every entry change
      const calendarEvents = entriesToCalendarEvents(
        sortedEntriesRef.current,
        startDate,
        endDate,
      );
      return filterEventsInRange(calendarEvents, startStr, endStr);
    },
    [],
  );

  const addEntries = useCallback(
    (newEntries: TimeOffEntry[]) => {
      const currentEntries = cloneEntries(sortedEntriesRef.current);
      pushUndo(currentEntries);
      const existingIds = new Set(currentEntries.map((e) => e.id));
      const nextEntriesMap = new Map(currentEntries.map((entry) => [entry.id, entry]));
      for (const entry of newEntries) {
        nextEntriesMap.set(entry.id, structuredClone(entry));
      }
      const nextEntries = sortEntries([...nextEntriesMap.values()]);
      sortedEntriesRef.current = nextEntries;
      if (!hasSyncCollectionAuth()) {
        writeLocalSnapshot(currentEntries, nextEntries);
        return;
      }
      for (const entry of newEntries) {
        if (existingIds.has(entry.id)) {
          timeOffCollection.update(entry.id, (d) => {
            Object.assign(d, entry);
          });
        } else {
          timeOffCollection.insert(entry);
        }
      }
    },
    [pushUndo],
  );

  const replaceEntries = useCallback((newEntries: TimeOffEntry[]) => {
    sortedEntriesRef.current = sortEntries(cloneEntries(newEntries));
    // Server-pushed data: write directly without pushing back to server and
    // without touching the undo/redo history.
    const existingKeys = timeOffCollection.toArray.map((e) => e.id);
    timeOffCollection.utils.writeBatch(() => {
      if (existingKeys.length > 0) timeOffCollection.utils.writeDelete(existingKeys);
      if (newEntries.length > 0) timeOffCollection.utils.writeInsert(newEntries);
    });
  }, []);

  const updateEntry = useCallback(
    (id: string, entry: TimeOffEntry) => {
      const currentEntries = cloneEntries(sortedEntriesRef.current);
      if (!currentEntries.some((existing) => existing.id === id)) {
        console.error(`Invalid entry id: ${id}`);
        return;
      }
      pushUndo(currentEntries);
      const nextEntries = sortEntries(
        currentEntries.map((existing) => (existing.id === id ? { ...structuredClone(entry), id } : existing)),
      );
      sortedEntriesRef.current = nextEntries;
      if (!hasSyncCollectionAuth()) {
        writeLocalSnapshot(currentEntries, nextEntries);
        return;
      }
      timeOffCollection.update(id, (d) => {
        // Exclude `id` from the spread — TanStack DB forbids changing an item's key.
        const { id: _id, ...fields } = entry;
        Object.assign(d, fields);
      });
    },
    [pushUndo],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      const currentEntries = cloneEntries(sortedEntriesRef.current);
      if (!currentEntries.some((existing) => existing.id === id)) {
        console.error(`Invalid entry id: ${id}`);
        return;
      }
      pushUndo(currentEntries);
      const nextEntries = currentEntries.filter((entry) => entry.id !== id);
      sortedEntriesRef.current = nextEntries;
      if (!hasSyncCollectionAuth()) {
        writeLocalSnapshot(currentEntries, nextEntries);
        return;
      }
      if ((timeOffCollection.toArray as TimeOffEntry[]).some((entry) => entry.id === id)) {
        timeOffCollection.delete(id);
      }
    },
    [pushUndo],
  );

  const deleteEntries = useCallback(
    (ids: string[]) => {
      const unique = ids.filter((id, index, arr) => arr.indexOf(id) === index);
      if (unique.length === 0) return;
      const currentEntries = cloneEntries(sortedEntriesRef.current);
      const existingIds = new Set(currentEntries.map((entry) => entry.id));
      const valid = unique.filter((id) => existingIds.has(id));
      if (valid.length === 0) {
        console.error("Invalid entry ids:", ids);
        return;
      }
      pushUndo(currentEntries);
      const nextEntries = currentEntries.filter((entry) => !valid.includes(entry.id));
      sortedEntriesRef.current = nextEntries;
      if (!hasSyncCollectionAuth()) {
        writeLocalSnapshot(currentEntries, nextEntries);
        return;
      }
      const collectionIds = new Set((timeOffCollection.toArray as TimeOffEntry[]).map((e) => e.id));
      for (const id of valid) {
        if (collectionIds.has(id)) {
          timeOffCollection.delete(id);
        }
      }
    },
    [pushUndo],
  );

  const importHday = useCallback(
    (text: string) => {
      const result = hdayToTimeOffEntries(text);
      const currentEntries = cloneEntries(sortedEntriesRef.current);
      pushUndo(currentEntries);
      const nextEntries = sortEntries(cloneEntries(result.entries));
      sortedEntriesRef.current = nextEntries;
      if (!hasSyncCollectionAuth()) {
        writeLocalSnapshot(currentEntries, nextEntries);
      } else {
        applySnapshotToCollection(currentEntries, result.entries);
      }
      return result;
    },
    [pushUndo],
  );

  const clearAll = useCallback(() => {
    const current = cloneEntries(sortedEntriesRef.current);
    if (current.length === 0) return;
    pushUndo(current);
    sortedEntriesRef.current = [];
    if (!hasSyncCollectionAuth()) {
      writeLocalSnapshot(current, []);
      return;
    }
    for (const entry of current) {
      timeOffCollection.delete(entry.id);
    }
  }, [pushUndo]);

  const undo = useCallback(() => {
    const history = historyRef.current;
    if (history.length === 0) return;
    const previous = history[history.length - 1]!;
    const current = cloneEntries(sortedEntriesRef.current);
    commitHistory(history.slice(0, -1));
    commitFuture([current, ...futureRef.current]);
    sortedEntriesRef.current = cloneEntries(previous);
    if (!hasSyncCollectionAuth()) {
      writeLocalSnapshot(current, previous);
      return;
    }
    applySnapshotToCollection(current, previous);
  }, [commitFuture, commitHistory]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    const [next, ...remaining] = future;
    if (!next) return;
    const current = cloneEntries(sortedEntriesRef.current);
    commitHistory([...historyRef.current, current].slice(-HISTORY_LIMIT));
    commitFuture(remaining);
    sortedEntriesRef.current = cloneEntries(next);
    if (!hasSyncCollectionAuth()) {
      writeLocalSnapshot(current, next);
      return;
    }
    applySnapshotToCollection(current, next);
  }, [commitFuture, commitHistory]);

  const contextValue: EventStoreContextType = useMemo(
    () => ({
      rawText,
      entries: sortedEntries,
      getEventsInRange,
      addEntries,
      replaceEntries,
      updateEntry,
      deleteEntry,
      deleteEntries,
      importHday,
      clearAll,
      canUndo: historyStack.length > 0,
      canRedo: futureStack.length > 0,
      undo,
      redo,
    }),
    [
      rawText,
      sortedEntries,
      getEventsInRange,
      addEntries,
      replaceEntries,
      updateEntry,
      deleteEntry,
      deleteEntries,
      importHday,
      clearAll,
      historyStack.length,
      futureStack.length,
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
