/**
 * Event Store Context
 *
 * Manages canonical time-off entries with CRUD operations and import/export
 * helpers, backed by `timeOffCollection` (a QueryCollection wired to the
 * sync pull/push endpoints).
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { useLiveQuery } from "@tanstack/react-db";
import type { CalendarEvent } from "@/lib/events/types";
import { entriesToCalendarEvents, filterEventsInRange } from "@/lib/events/converters";
import { hdayToTimeOffEntries, timeOffEntriesToHday } from "@/lib/timeOff/codecs";
import type { TimeOffEntry } from "@/lib/timeOff/types";
import type { TimeOffImportResult } from "@/lib/timeOff/types";
import { getTimeOffEntryIdentityKey, getTimeOffEntrySortKey } from "@/lib/timeOff/types";
import { dayjs } from "@/utils/dateTimeUtils";
import { hasSyncCollectionAuth, runWriteBatch, timeOffCollection } from "@/db/collections";

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
}

const EventStoreContext = createContext<EventStoreContextType | undefined>(undefined);

interface EventStoreProviderProps {
  children: ReactNode;
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

function cloneEntries(entries: TimeOffEntry[]): TimeOffEntry[] {
  return entries.map((entry) => structuredClone(entry));
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

  // Stable ref so callbacks don't need to list the live array as a dep
  const sortedEntriesRef = useRef<TimeOffEntry[]>(sortedEntries);
  sortedEntriesRef.current = sortedEntries;

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
            const { id: _id, ...patch } = entry;
            Object.assign(d, patch);
          });
        } else {
          timeOffCollection.insert(entry);
        }
      }
    },
    [],
  );

  const replaceEntries = useCallback((newEntries: TimeOffEntry[]) => {
    sortedEntriesRef.current = sortEntries(cloneEntries(newEntries));
    // Server-pushed data: write directly without pushing back to server.
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
    [],
  );

  const deleteEntry = useCallback(
    (id: string) => {
      const currentEntries = cloneEntries(sortedEntriesRef.current);
      if (!currentEntries.some((existing) => existing.id === id)) {
        console.error(`Invalid entry id: ${id}`);
        return;
      }
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
    [],
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
    [],
  );

  const importHday = useCallback(
    (text: string) => {
      const result = hdayToTimeOffEntries(text);
      const currentEntries = cloneEntries(sortedEntriesRef.current);
      const nextEntries = sortEntries(cloneEntries(result.entries));
      sortedEntriesRef.current = nextEntries;
      if (!hasSyncCollectionAuth()) {
        writeLocalSnapshot(currentEntries, nextEntries);
      } else {
        const currentMap = new Map(currentEntries.map((e) => [e.id, e]));
        const collectionIds = new Set((timeOffCollection.toArray as TimeOffEntry[]).map((e) => e.id));
        const toDelete = [...currentMap.keys()].filter((id) => !result.entries.some((e) => e.id === id));
        const hasWork = toDelete.length > 0 || result.entries.length > 0;
        runWriteBatch(timeOffCollection, hasWork, () => {
          for (const id of toDelete) {
            if (collectionIds.has(id)) timeOffCollection.delete(id);
          }
          for (const entry of result.entries) {
            if (!collectionIds.has(entry.id)) {
              timeOffCollection.insert(entry);
            } else {
              timeOffCollection.update(entry.id, (d) => {
                const { id: _id, ...patch } = entry;
                Object.assign(d, patch);
              });
            }
          }
        });
      }
      return result;
    },
    [],
  );

  const clearAll = useCallback(() => {
    const current = cloneEntries(sortedEntriesRef.current);
    if (current.length === 0) return;
    sortedEntriesRef.current = [];
    if (!hasSyncCollectionAuth()) {
      writeLocalSnapshot(current, []);
      return;
    }
    runWriteBatch(timeOffCollection, current.length > 0, () => {
      for (const entry of current) {
        timeOffCollection.delete(entry.id);
      }
    });
  }, []);

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