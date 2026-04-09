/**
 * useOngoingSync
 *
 * Manages the ongoing sync cycle that runs after the first-sync flow has
 * established a cursor for this device (see useFirstSyncFlow).
 *
 * Behavior (per docs/local-first-sync-flow.md §3):
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
  countPushConflicts,
  dequeueAndMergeSyncOutbox,
  fetchSyncStatus,
  getSyncOutboxSize,
  pullSyncData,
  pushSyncPayload,
  storeSyncCursor,
  type SyncPullResponse,
  type SyncPushPayload,
  type SyncPushResponse,
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
  /** True when the last flush-and-pull cycle failed (server/network error). */
  hasSyncError: boolean;
  /**
   * Number of records that had conflicts in the last push operation.
   * Non-zero means the server version was kept for those records.
   * Resets to 0 after the next successful conflict-free sync.
   */
  conflictCount: number;
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
  const [hasSyncError, setHasSyncError] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);

  // Keep a stable ref to the latest pull callback so the flush closure does
  // not become stale when `onIncrementalPull` identity changes.
  const onIncrementalPullRef = useRef(onIncrementalPull);
  useEffect(() => {
    onIncrementalPullRef.current = onIncrementalPull;
  }, [onIncrementalPull]);

  // Guard: prevent concurrent flushes.
  const isFlushingRef = useRef(false);
  // Serialise concurrent enqueueChange calls so that two rapid mutations do
  // not race to push simultaneously and produce a split-brain cursor state.
  const enqueueQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Guard: track component lifetime so async callbacks skip state updates after unmount.
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
      let flushConflicts = 0;
      const dequeued = dequeueAndMergeSyncOutbox(userId);
      if (dequeued) {
        const { merged, commit } = dequeued;
        let pushResult: SyncPushResponse | null;
        try {
          pushResult = await pushSyncPayload(fetchFn, merged);
        } catch (err) {
          // Push threw (e.g. network error) — outbox stays intact for next retry.
          console.error("useOngoingSync: outbox push threw:", err);
          if (!mountedRef.current) return;
          setOutboxCount(getSyncOutboxSize(userId));
          setHasSyncError(true);
          return;
        }
        if (!mountedRef.current) return;
        if (!pushResult) {
          // Push returned falsy — outbox stays intact for next retry.
          setOutboxCount(getSyncOutboxSize(userId));
          setHasSyncError(true);
          return;
        }
        // Push succeeded — commit (clear) the outbox and continue to pull.
        commit();
        setOutboxCount(getSyncOutboxSize(userId));
        // Surface any conflicts from the outbox flush.
        flushConflicts = countPushConflicts(pushResult);
        if (flushConflicts > 0) {
          setConflictCount(flushConflicts);
        }
      }

      // --- Pull ---
      // When conflicts occurred during push (or remain unresolved), skip the
      // cursor so that conflicted records are always included regardless of their
      // server `updated_at`.
      const cursor =
        flushConflicts > 0 || conflictCount > 0
          ? undefined
          : (localStorage.getItem(getSyncCursorKey(userId)) ?? undefined);
      const pullResult = await pullSyncData(fetchFn, cursor);
      if (!mountedRef.current) return;
      if (pullResult) {
        onIncrementalPullRef.current?.(pullResult);
        storeSyncCursor(userId, pullResult.server_timestamp);
        setLastSyncedAt(pullResult.server_timestamp);
        setHasSyncError(false);
      } else {
        setHasSyncError(true);
      }
    } finally {
      if (mountedRef.current) {
        setIsSyncing(false);
      }
      isFlushingRef.current = false;
    }
  }, [isActive, userId, fetchFn, conflictCount]);

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

  // Reset per-user state when the signed-in user changes (e.g. sign-out /
  // sign-in to a different account).  The lazy useState initializers only run
  // once on mount, so without this effect they would serve stale data for the
  // new user.
  useEffect(() => {
    setLastSyncedAt(userId ? localStorage.getItem(getSyncCursorKey(userId)) : null);
    setOutboxCount(userId ? getSyncOutboxSize(userId) : 0);
    setHasSyncError(false);
    setConflictCount(0);
    hasRunInitialFlushRef.current = false;
  }, [userId]);

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
          // Detect conflicts — if any records were rejected, do a full pull (no
          // `since`) so that conflicted records are always included regardless of
          // where the local cursor sits relative to the server's `updated_at`.
          const conflicts = countPushConflicts(result);
          if (conflicts > 0) {
            setConflictCount(conflicts);
            let pullResult: SyncPullResponse | null = null;
            try {
              pullResult = await pullSyncData(fetchFn);
            } catch (err) {
              // Reconciliation pull threw — surface as a sync error but do NOT requeue.
              console.error("useOngoingSync: reconciliation pull threw:", err);
              if (mountedRef.current) {
                setHasSyncError(true);
              }
              return;
            }
            if (!mountedRef.current) return;
            if (pullResult) {
              // Pull succeeded — now run post-success reconciliation.
              try {
                onIncrementalPullRef.current?.(pullResult);
                storeSyncCursor(userId, pullResult.server_timestamp);
                setLastSyncedAt(pullResult.server_timestamp);
                setHasSyncError(false);
              } catch (err) {
                // Post-success callback threw — log but do NOT requeue the change.
                console.error("useOngoingSync: post-reconciliation callback threw:", err);
                if (mountedRef.current) {
                  setHasSyncError(true);
                }
              }
            } else {
              // Reconciliation pull failed — surface as a sync error.
              setHasSyncError(true);
            }
          } else {
            setConflictCount(0);
            // Refresh the cursor so incremental pulls stay accurate.  A second
            // network request is required here because the push response only
            // contains per-record results (no server_timestamp).  The alternative
            // would be to extend the backend push response with a timestamp, which
            // would eliminate this extra round trip.
            const newStatus = await fetchSyncStatus(fetchFn);
            if (!mountedRef.current) return;
            if (newStatus) {
              storeSyncCursor(userId, newStatus.server_timestamp);
              setLastSyncedAt(newStatus.server_timestamp);
            }
            setHasSyncError(false);
          }
        } else {
          // Push failed — queue for later flush.
          appendToSyncOutbox(userId, change);
          setOutboxCount(getSyncOutboxSize(userId));
        }
      };

      // Chain onto the serialisation queue.  Each task handles its own errors
      // so the chain never rejects and does not block later enqueue calls.
      enqueueQueueRef.current = enqueueQueueRef.current.then(async () => {
        try {
          await doEnqueue();
        } catch {
          // On unexpected error, queue the change so it is not lost.
          if (mountedRef.current) {
            appendToSyncOutbox(userId, change);
            setOutboxCount(getSyncOutboxSize(userId));
          }
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
      hasSyncError: false,
      conflictCount: 0,
      enqueueChange: () => {},
    };
  }

  return { isSyncing, lastSyncedAt, outboxCount, hasSyncError, conflictCount, enqueueChange };
}