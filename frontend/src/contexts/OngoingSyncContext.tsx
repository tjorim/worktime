/**
 * OngoingSyncContext
 *
 * Provides `enqueueChange` and sync-status values (isSyncing, lastSyncedAt,
 * outboxCount) to all descendant components after the first-sync flow has
 * completed.
 *
 * Rendering `<OngoingSyncProvider>` inside both `<AuthProvider>` and
 * `<EventStoreProvider>` is required because it calls `useAuth()`,
 * `useApiClient()`, and `useEventStore()` internally.
 *
 * Write hooks (`useTimeTrackingStorage`, `useWorkLocationStorage`) call
 * `useOngoingSyncContext()` to obtain `enqueueChange`.  The hook returns a
 * no-op implementation when no provider is present (e.g. in tests), so
 * existing test setups do not need to change.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useEventStore } from "./EventStoreContext";
import { useApiClient } from "@/hooks/useApiClient";
import { useOngoingSync, type OngoingSyncState, type EnqueueChangeFn } from "@/hooks/useOngoingSync";
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
}

const NO_OP_CONTEXT: OngoingSyncContextType = {
  isSyncing: false,
  lastSyncedAt: null,
  outboxCount: 0,
  hasSyncError: false,
  conflictCount: 0,
  enqueueChange: () => {},
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
  const { entries: currentTimeOffEntries, replaceEntries } = useEventStore();

  // Build the incremental-pull callback.  When a pull returns data, merge it
  // into localStorage and the EventStore without resetting other state.
  const onIncrementalPull = useCallback(
    (data: SyncPullResponse) => {
      const merged = applyIncrementalSyncPullResponse(data, currentTimeOffEntries);
      replaceEntries(merged);
    },
    [currentTimeOffEntries, replaceEntries],
  );

  const { enqueueChange, isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount } = useOngoingSync(
    isSyncEstablished,
    userId,
    isAuthenticated ? fetchFn : null,
    onIncrementalPull,
  );

  const value = useMemo<OngoingSyncContextType>(
    () => ({ enqueueChange, isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount }),
    [enqueueChange, isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount],
  );

  return <OngoingSyncContext.Provider value={value}>{children}</OngoingSyncContext.Provider>;
}

/**
 * Build a full sync payload skeleton with all arrays initialised to empty.
 * Callers fill in the relevant entity arrays before calling `enqueueChange`.
 */
export function emptySyncPayload(): SyncPushPayload {
  return { labels: [], tasks: [], templates: [], work_locations: [], time_off_entries: [] };
}
