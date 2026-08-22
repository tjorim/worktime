/**
 * OngoingSyncContext
 *
 * Provides `enqueueChange` and sync-status values (isSyncing, lastSyncedAt,
 * outboxCount) to all descendant components after the first-sync flow has
 * completed.
 *
 * Rendering `<OngoingSyncProvider>` inside `<AuthProvider>`, `<ToastProvider>`,
 * and `<SettingsProvider>` is required because it calls `useAuth()`,
 * `useApiClient()`, and `useSettings()`. Sync does not depend on the local
 * .hday helper.
 *
 * Incremental-pull data is applied directly to TanStack DB collections via
 * `applyIncrementalPullToCollections` — no EventStore dependency required.
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "./AuthContext";
import { useApiClient } from "@/hooks/useApiClient";
import {
  useOngoingSync,
  type OngoingSyncState,
  type EnqueueChangeFn,
  type TriggerPullFn,
  type ResolveOngoingConflictsFn,
} from "@/hooks/useOngoingSync";
import {
  useSyncSignal,
  createFetchSseTransport,
  type SyncSignalTransport,
} from "@/hooks/useSyncSignal";
import { setSyncCollectionAuth, applyIncrementalPullToCollections } from "@/db/collections";
import { type SyncPullResponse, type SyncPushPayload } from "@/utils/syncClient";

const PREFERENCES_PULL_DEBOUNCE_MS = 250;

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
  quarantineCount: 0,
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
 * Must be rendered inside `<AuthProvider>`, `<ToastProvider>`,
 * `<SettingsProvider>`, and `<EventStoreProvider>`.
 */
export function OngoingSyncProvider({ children, isSyncEstablished }: OngoingSyncProviderProps) {
  const { isAuthenticated, userId, getAccessToken } = useAuth();
  const {
    settings,
    myTeam,
    scheduleType,
    hasCompletedOnboarding,
    accountSyncAnnouncementSeen,
    ganttAnnouncementSeen,
    crossBorderAnnouncementSeen,
  } = useSettings();
  const fetchFn = useApiClient();

  // Keep collection mutation handlers informed of the current user ID and token
  // so they can send the Bearer JWT and queue outbox entries under the correct user key.
  useEffect(() => {
    setSyncCollectionAuth(
      isAuthenticated ? (userId ?? null) : null,
      isAuthenticated ? getAccessToken() : null,
    );
  }, [isAuthenticated, userId, getAccessToken]);

  // Build the incremental-pull callback. When a pull returns data, apply it
  // to all collections via direct writes (no server re-push triggered).
  const onIncrementalPull = useCallback((data: SyncPullResponse) => {
    applyIncrementalPullToCollections(data);
  }, []);

  const {
    enqueueChange,
    triggerPull,
    resolveOngoingConflicts,
    isSyncing,
    lastSyncedAt,
    outboxCount,
    quarantineCount,
    hasSyncError,
    conflictCount,
    conflictedPayload,
    retryAfter,
  } = useOngoingSync(
    isSyncEstablished,
    userId,
    isAuthenticated ? fetchFn : null,
    onIncrementalPull,
  );

  // Build the SSE transport. The transport is null when the user is not
  // authenticated, or has no access token yet, so that no connection is
  // opened before sync is established. Re-created whenever the access token
  // value changes (e.g. after a silent OIDC renewal) so the new connection
  // always carries a fresh Bearer token — `createFetchSseTransport` bakes the
  // token into the request at subscribe() time rather than reading it live.
  const accessToken = isAuthenticated ? getAccessToken() : null;
  const sseTransport = useMemo<SyncSignalTransport | null>(() => {
    if (!accessToken) return null;
    return createFetchSseTransport("/api/sync/events", accessToken);
  }, [accessToken]);

  // Subscribe to sync-changed signals and trigger incremental pulls.
  useSyncSignal(isSyncEstablished && isAuthenticated, userId, triggerPull, sseTransport);

  // lastUsed (activeTab, scheduleView, otherSchedule) is local UI navigation state —
  // exclude it so routine tab switches don't trigger unnecessary sync pulls.
  const preferencesSyncKey = JSON.stringify({
    settings,
    myTeam,
    scheduleType,
    hasCompletedOnboarding,
    accountSyncAnnouncementSeen,
    ganttAnnouncementSeen,
    crossBorderAnnouncementSeen,
  });
  const hasSeenPreferencesStateRef = useRef(false);
  const pendingPullTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isSyncEstablished || !isAuthenticated) {
      hasSeenPreferencesStateRef.current = false;
      if (pendingPullTimerRef.current !== null) {
        clearTimeout(pendingPullTimerRef.current);
        pendingPullTimerRef.current = null;
      }
      return;
    }
    if (!hasSeenPreferencesStateRef.current) {
      hasSeenPreferencesStateRef.current = true;
      return;
    }
    if (pendingPullTimerRef.current !== null) {
      clearTimeout(pendingPullTimerRef.current);
    }
    pendingPullTimerRef.current = setTimeout(() => {
      pendingPullTimerRef.current = null;
      triggerPull();
    }, PREFERENCES_PULL_DEBOUNCE_MS);

    return () => {
      if (pendingPullTimerRef.current !== null) {
        clearTimeout(pendingPullTimerRef.current);
        pendingPullTimerRef.current = null;
      }
    };
  }, [isSyncEstablished, isAuthenticated, preferencesSyncKey, triggerPull]);

  const value = useMemo<OngoingSyncContextType>(
    () => ({
      enqueueChange,
      triggerPull,
      resolveOngoingConflicts,
      isSyncing,
      lastSyncedAt,
      outboxCount,
      quarantineCount,
      hasSyncError,
      conflictCount,
      conflictedPayload,
      retryAfter,
    }),
    [
      enqueueChange,
      triggerPull,
      resolveOngoingConflicts,
      isSyncing,
      lastSyncedAt,
      outboxCount,
      quarantineCount,
      hasSyncError,
      conflictCount,
      conflictedPayload,
      retryAfter,
    ],
  );

  return <OngoingSyncContext.Provider value={value}>{children}</OngoingSyncContext.Provider>;
}

/**
 * Build a full sync payload skeleton with all arrays initialised to empty.
 * Callers fill in the relevant entity arrays before calling `enqueueChange`.
 */
export function emptySyncPayload(): SyncPushPayload {
  return {
    labels: [],
    tasks: [],
    templates: [],
    work_locations: [],
    time_off_entries: [],
    gantt_tasks: [],
  };
}
