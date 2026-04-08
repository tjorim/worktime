/**
 * useOngoingSync
 *
 * Manages the ongoing sync cycle that runs after the first-sync flow has
 * established a cursor for this device (see useFirstSyncFlow).
 *
 * Behaviour (per docs/local-first-sync-flow.md §3):
 *
 * - **Sync on write**: callers invoke `enqueueChange(payload)` after each
 *   local mutation.  The hook immediately attempts to push the change to
 *   `POST /db/sync/push`.  On success, the sync cursor is refreshed.  On
 *   failure (e.g. offline), the change is appended to the outbox queue stored
 *   at `worktime_sync_outbox_<userId>` in localStorage.
 *
 * - **Reconnect / focus flush**: whenever the browser reports that the page
 *   became visible again (`visibilitychange`) or the device came back online
 *   (`online` event), the hook:
 *     1. Flushes all pending outbox entries in one merged push.
 *     2. Pulls incremental changes from the server via
 *        `GET /db/sync/pull?since=<cursor>` and passes the result to the
 *        optional `onIncrementalPull` callback so the caller can update the
 *        in-memory stores.
 *
 * - The hook is a no-op when `isSyncEstablished` is false (first sync not
 *   yet complete) or when `fetchFn` / `userId` are absent.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendToSyncOutbox,
  dequeueAndMergeSyncOutbox,
  fetchSyncStatus,
  getSyncOutboxSize,
  pullSyncData,
  pushSyncPayload,
  storeSyncCursor,
  type SyncPullResponse,
  type SyncPushPayload,
} from "@/utils/syncClient";
import { getSyncCursorKey } from "@/constants/storageKeys";

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export interface OngoingSyncState {
  /** True while a push or pull network request is in flight. */
  isSyncing: boolean;
  /** ISO-8601 timestamp of the last successfully refreshed cursor, or null. */
  lastSyncedAt: string | null;
  /** Number of changes waiting in the outbox queue. */
  outboxCount: number;
}

export type EnqueueChangeFn = (change: SyncPushPayload) => void;

/**
 * Hook that manages ongoing write-through sync and incremental pulls after the
 * first-sync flow has completed.
 *
 * @param isSyncEstablished - True when a sync cursor exists for the current user.
 *   Derived from `useFirstSyncFlow`'s `isSyncEstablished` return value.
 * @param userId - Authenticated user ID, or null.
 * @param fetchFn - Authenticated fetch function from `useApiClient`, or null.
 * @param onIncrementalPull - Optional callback invoked with each successful pull
 *   response so the caller can merge the data into in-memory stores.
 */
export function useOngoingSync(
  isSyncEstablished: boolean,
  userId: string | null,
  fetchFn: FetchFn | null,
  onIncrementalPull?: (data: SyncPullResponse) => void,
): OngoingSyncState & { enqueueChange: EnqueueChangeFn } {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    if (!userId) return null;
    return localStorage.getItem(getSyncCursorKey(userId));
  });
  const [outboxCount, setOutboxCount] = useState<number>(() => {
    if (!userId) return 0;
    return getSyncOutboxSize(userId);
  });

  // Keep a stable ref to the latest pull callback so the flush closure does
  // not become stale when `onIncrementalPull` identity changes.
  const onIncrementalPullRef = useRef(onIncrementalPull);
  useEffect(() => {
    onIncrementalPullRef.current = onIncrementalPull;
  }, [onIncrementalPull]);

  // Guard: prevent concurrent flushes.
  const isFlushingRef = useRef(false);
  // Guard: prevent enqueueChange from overlapping with itself for the same op.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const isActive = isSyncEstablished && !!userId && !!fetchFn;

  /** Flush the outbox queue and then pull incremental changes. */
  const flushAndPull = useCallback(async () => {
    if (!isActive || !userId || !fetchFn) return;
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;
    setIsSyncing(true);
    try {
      // --- Flush outbox ---
      const merged = dequeueAndMergeSyncOutbox(userId);
      if (merged) {
        const pushResult = await pushSyncPayload(fetchFn, merged);
        if (!mountedRef.current) return;
        if (!pushResult) {
          // Re-enqueue all items as a single payload so nothing is lost.
          appendToSyncOutbox(userId, merged);
        }
        setOutboxCount(getSyncOutboxSize(userId));
      }

      // --- Incremental pull ---
      const cursor = localStorage.getItem(getSyncCursorKey(userId));
      const pullResult = await pullSyncData(fetchFn, cursor ?? undefined);
      if (!mountedRef.current) return;
      if (pullResult) {
        onIncrementalPullRef.current?.(pullResult);
        storeSyncCursor(userId, pullResult.server_timestamp);
        setLastSyncedAt(pullResult.server_timestamp);
      }
    } finally {
      if (mountedRef.current) {
        setIsSyncing(false);
      }
      isFlushingRef.current = false;
    }
  }, [isActive, userId, fetchFn]);

  // Listen for reconnect and visibility-change events.
  useEffect(() => {
    if (!isActive) return;

    const handleOnline = () => {
      flushAndPull().catch((err: unknown) => {
        console.error("useOngoingSync: flush on online event failed:", err);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        flushAndPull().catch((err: unknown) => {
          console.error("useOngoingSync: flush on visibility change failed:", err);
        });
      }
    };

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isActive, flushAndPull]);

  // When sync becomes established for the first time in this session, do an
  // initial flush + pull to pick up any changes from other devices.
  const hasRunInitialFlushRef = useRef(false);
  useEffect(() => {
    if (!isActive) return;
    if (hasRunInitialFlushRef.current) return;
    // Only run the initial flush if we are currently online.
    if (!navigator.onLine) return;
    hasRunInitialFlushRef.current = true;
    flushAndPull().catch((err: unknown) => {
      console.error("useOngoingSync: initial flush on mount failed:", err);
    });
  }, [isActive, flushAndPull]);

  /**
   * Push a single change payload to the server immediately.  Falls back to the
   * outbox queue if the push fails (e.g. device is offline).
   */
  const enqueueChange: EnqueueChangeFn = useCallback(
    (change: SyncPushPayload) => {
      if (!isActive || !userId || !fetchFn) return;

      const doEnqueue = async () => {
        // Attempt an immediate push.
        const result = await pushSyncPayload(fetchFn, change);
        if (!mountedRef.current) return;
        if (result) {
          // Refresh the cursor so incremental pulls stay accurate.
          const newStatus = await fetchSyncStatus(fetchFn);
          if (!mountedRef.current) return;
          if (newStatus) {
            storeSyncCursor(userId, newStatus.server_timestamp);
            setLastSyncedAt(newStatus.server_timestamp);
          }
        } else {
          // Push failed — queue for later flush.
          appendToSyncOutbox(userId, change);
          setOutboxCount(getSyncOutboxSize(userId));
        }
      };

      doEnqueue().catch(() => {
        // On unexpected error, queue the change so it is not lost.
        if (mountedRef.current) {
          appendToSyncOutbox(userId, change);
          setOutboxCount(getSyncOutboxSize(userId));
        }
      });
    },
    [isActive, userId, fetchFn],
  );

  if (!isActive) {
    return {
      isSyncing: false,
      lastSyncedAt: null,
      outboxCount: 0,
      enqueueChange: () => {},
    };
  }

  return { isSyncing, lastSyncedAt, outboxCount, enqueueChange };
}
