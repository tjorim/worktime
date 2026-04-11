/**
 * OngoingSyncContext
 *
 * Provides `enqueueChange` and sync-status values (isSyncing, lastSyncedAt,
 * outboxCount) to all descendant components after the first-sync flow has
 * completed.
 *
 * Rendering `<OngoingSyncProvider>` inside `<AuthProvider>`,
 * `<DeveloperOptionsProvider>`, `<ToastProvider>`, and `<EventStoreProvider>`
 * is required because it calls `useAuth()`, `useApiClient()` (which depends on
 * `<DeveloperOptionsProvider>` and `<ToastProvider>`), and `useEventStore()`
 * internally.
 *
 * Write hooks (`useTimeTrackingStorage`, `useWorkLocationStorage`) call
 * `useOngoingSyncContext()` to obtain `enqueueChange`.  The hook returns a
 * no-op implementation when no provider is present (e.g. in tests), so
 * existing test setups do not need to change.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useAuth } from "./AuthContext";
import { useEventStore } from "./EventStoreContext";
import { useDeveloperOptions } from "./DeveloperOptionsContext";
import { useApiClient } from "@/hooks/useApiClient";
import { useOngoingSync, type OngoingSyncState, type EnqueueChangeFn, type TriggerPullFn, type ResolveOngoingConflictsFn } from "@/hooks/useOngoingSync";
import { useSyncSignal, createSseTransport, type SyncSignalTransport } from "@/hooks/useSyncSignal";
import {
  applyIncrementalSyncPullResponse,
  type SyncPullResponse,
  type SyncPushPayload,
} from "@/utils/syncClient";

export interface OngoingSyncContextType extends OngoingSyncState {
  /**
   * Push a single change payload to the server (or queue it for later flush).
   * Call this after each local write so the server stays in sync.
   */
  enqueueChange: EnqueueChangeFn;
  /**
   * Trigger an incremental pull (flush outbox + pull from server).
   * Transport-neutral entry point for external callers such as SSE listeners.
   */
  triggerPull: TriggerPullFn;
  /**
   * Resolve a pending ongoing-sync conflict.
   * `"keep-server"` accepts the server version and clears the conflict state.
   * `"keep-mine"` re-pushes the conflicted items with fresh timestamps.
   */
  resolveOngoingConflicts: ResolveOngoingConflictsFn;
}

const NO_OP_CONTEXT: OngoingSyncContextType = {
  isSyncing: false,
  lastSyncedAt: null,
  outboxCount: 0,
  hasSyncError: false,
  conflictCount: 0,
  conflictedPayload: null,
  retryAfter: null,
  enqueueChange: () => {},
  triggerPull: () => {},
  resolveOngoingConflicts: () => {},
};

const OngoingSyncContext = createContext<OngoingSyncContextType | null>(null);

/**
 * Access the ongoing-sync context.
 *
 * Returns a no-op implementation when called outside `<OngoingSyncProvider>`
 * so that write hooks remain usable in unit tests without extra wrappers.
 */
export function useOngoingSyncContext(): OngoingSyncContextType {
  return useContext(OngoingSyncContext) ?? NO_OP_CONTEXT;
}

interface OngoingSyncProviderProps {
  children: ReactNode;
  /**
   * Whether sync has been established for the current user (sync cursor
   * exists).  Passed down from the first-sync flow result.
   */
  isSyncEstablished: boolean;
}

/**
 * Provider that wires `useOngoingSync` with the auth and event-store contexts
 * and makes sync operations available to the component tree.
 *
 * Must be rendered inside `<AuthProvider>`, `<DeveloperOptionsProvider>`,
 * `<ToastProvider>`, and `<EventStoreProvider>`.
 */
export function OngoingSyncProvider({ children, isSyncEstablished }: OngoingSyncProviderProps) {
  const { isAuthenticated, userId } = useAuth();
  const fetchFn = useApiClient();
  const { options } = useDeveloperOptions();
  const { entries: currentTimeOffEntries, replaceEntries } = useEventStore();

  // Keep a ref to currentTimeOffEntries so that onIncrementalPull always reads
  // the latest local entries without needing to be recreated on every change.
  const currentTimeOffEntriesRef = useRef(currentTimeOffEntries);
  useEffect(() => {
    currentTimeOffEntriesRef.current = currentTimeOffEntries;
  }, [currentTimeOffEntries]);

  // Build the incremental-pull callback.  When a pull returns data, merge it
  // into localStorage and the EventStore without resetting other state.
  const onIncrementalPull = useCallback(
    (data: SyncPullResponse) => {
      const merged = applyIncrementalSyncPullResponse(data, currentTimeOffEntriesRef.current);
      replaceEntries(merged);
    },
    [replaceEntries],
  );

  const { enqueueChange, triggerPull, resolveOngoingConflicts, isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount, conflictedPayload, retryAfter } = useOngoingSync(
    isSyncEstablished,
    userId,
    isAuthenticated ? fetchFn : null,
    onIncrementalPull,
  );

  // Build the SSE transport once per API base URL change.  The transport is
  // null when the user is not authenticated so that no connection is opened
  // before sync is established.
  const sseTransport = useMemo<SyncSignalTransport | null>(() => {
    if (!isAuthenticated) return null;
    if (!options.apiUrl) return null;
    const eventsUrl = new URL("/api/sync/events", options.apiUrl).toString();
    return createSseTransport(eventsUrl);
  }, [isAuthenticated, options.apiUrl]);

  // Subscribe to sync-changed signals and trigger incremental pulls.
  useSyncSignal(isSyncEstablished && isAuthenticated, userId, triggerPull, sseTransport);

  const value = useMemo<OngoingSyncContextType>(
    () => ({ enqueueChange, triggerPull, resolveOngoingConflicts, isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount, conflictedPayload, retryAfter }),
    [enqueueChange, triggerPull, resolveOngoingConflicts, isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount, conflictedPayload, retryAfter],
  );

  return <OngoingSyncContext.Provider value={value}>{children}</OngoingSyncContext.Provider>;
}

/**
 * Build a full sync payload skeleton with all arrays initialised to empty.
 * Callers fill in the relevant entity arrays before calling `enqueueChange`.
 *
 * Note: `time_off_entries` is included in the skeleton because the backend
 * push endpoint accepts them, but write hooks (`useTimeTrackingStorage`,
 * `useWorkLocationStorage`) do not populate it — time-off entries are managed
 * exclusively through the EventStore and are received via incremental pull
 * (`applyIncrementalSyncPullResponse`) rather than pushed from write hooks.
 */
export function emptySyncPayload(): SyncPushPayload {
  return { labels: [], tasks: [], templates: [], work_locations: [], time_off_entries: [], gantt_tasks: [] };
}
