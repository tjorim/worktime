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
  bumpClientTimestamps,
  countPushConflicts,
  dequeueAndMergeSyncOutbox,
  extractConflictedItems,
  getSyncOutboxSize,
  getSyncQuarantineSize,
  maxConflictServerTimestamp,
  pullSyncData,
  pushSyncPayloadDetailed,
  quarantineSyncChange,
  reconcilePreferences,
  storeSyncCursor,
  type PushOutcome,
  type SyncPullResponse,
  type SyncPushPayload,
} from "@/utils/syncClient";
import { getSyncCursorKey } from "@/constants/storageKeys";
import { logger } from "@/utils/logger";

type BackgroundSafeRequestInit = RequestInit & {
  suppressUnauthorizedRedirect?: boolean;
};
type FetchFn = (
  url: string,
  init?: BackgroundSafeRequestInit,
) => Promise<Response>;

/** Minimum delay (ms) for the first outbox flush retry after a failure. */
export const INITIAL_BACK_OFF_MS = 1_000;
/** Maximum delay (ms) between outbox flush retries. */
const MAX_BACK_OFF_MS = 60_000;

export interface OngoingSyncState {
  /** True while a push or pull network request is in flight. */
  isSyncing: boolean;
  /** ISO-8601 timestamp of the last successfully refreshed cursor, or null. */
  lastSyncedAt: string | null;
  /** Number of changes waiting in the outbox queue. */
  outboxCount: number;
  /**
   * Number of batches the server permanently refused and that were set aside
   * so they could not wedge the outbox.  Non-zero means some local changes are
   * not on the server and never will be without intervention.
   */
  quarantineCount: number;
  /** True when the last flush-and-pull cycle failed (server/network error). */
  hasSyncError: boolean;
  /**
   * Number of records that had conflicts in the last push operation.
   * Non-zero means the server version was kept for those records.
   * Resets to 0 after the user resolves the conflict.
   */
  conflictCount: number;
  /**
   * The subset of the last push payload whose records were rejected (conflict).
   * Non-null when `conflictCount > 0`.  Used by the conflict-resolution UI to
   * show entity types/counts and to re-push with updated timestamps.
   */
  conflictedPayload: SyncPushPayload | null;
  /**
   * Epoch timestamp (ms) before which the next automatic outbox flush is
   * suppressed by exponential back-off.  Null when there is no active
   * back-off.  A forced flush (e.g. `online` event after reconnect) bypasses
   * this delay.
   */
  retryAfter: number | null;
}

export type EnqueueChangeFn = (change: SyncPushPayload) => void;

/**
 * Trigger an incremental pull (flush outbox + pull from server).  Transport-neutral
 * entry point — callers do not need to know about cursor, outbox, or merge logic.
 */
export type TriggerPullFn = () => void;

/**
 * Resolve a pending ongoing-sync conflict.
 *
 * - `"keep-server"`: accept the server version — clears the conflict state without re-pushing.
 * - `"keep-mine"`: re-push the conflicted local items with `client_updated_at = now()` so
 *   they win the last-write-wins check on the next push.
 */
export type ResolveOngoingConflictsFn = (
  choice: "keep-server" | "keep-mine",
) => void;

/** Stable no-op used by the inactive-mode return value to ensure consistent function identity. */
const NOOP = () => {};

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
): OngoingSyncState & {
  enqueueChange: EnqueueChangeFn;
  triggerPull: TriggerPullFn;
  resolveOngoingConflicts: ResolveOngoingConflictsFn;
} {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => {
    if (!userId) return null;
    return localStorage.getItem(getSyncCursorKey(userId));
  });
  const [outboxCount, setOutboxCount] = useState<number>(() => {
    if (!userId) return 0;
    return getSyncOutboxSize(userId);
  });
  const [quarantineCount, setQuarantineCount] = useState<number>(() => {
    if (!userId) return 0;
    return getSyncQuarantineSize(userId);
  });
  const [hasSyncError, setHasSyncError] = useState(false);
  const [conflictCount, setConflictCount] = useState(0);
  const [conflictedPayload, setConflictedPayload] =
    useState<SyncPushPayload | null>(null);
  // Keep a stable ref to conflictedPayload for use inside callbacks without
  // creating stale closures.
  const conflictedPayloadRef = useRef<SyncPushPayload | null>(null);
  // Tracks the max server_updated_at reported for conflicted records so that
  // "keep-mine" re-pushes carry a timestamp >= the server's to guarantee a LWW win.
  const conflictServerTimestampRef = useRef<string | undefined>(undefined);
  // Exponential back-off state for failed flush-and-pull cycles.
  // retryDelayMsRef holds the *current* delay (0 = no active back-off).
  // retryAfterRef mirrors the state value so flushAndPull can read it without
  // creating a stale closure / extra dependency.
  const retryDelayMsRef = useRef(0);
  const retryAfterRef = useRef<number | null>(null);
  const [retryAfter, setRetryAfter] = useState<number | null>(null);
  // Timer that actually fires the next retry once the back-off window
  // elapses. Without this, back-off only *gates* passive triggers
  // (visibility/online) — a tab left open and idle past the window would
  // never retry until the user did something. `flushAndPullRef` breaks the
  // circular reference (flushAndPull itself depends on scheduleBackOff).
  const backOffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushAndPullRef = useRef<
    ((force?: boolean, suppressUnauthorizedRedirect?: boolean) => Promise<void>) | null
  >(null);

  const clearBackOffTimer = useCallback(() => {
    if (backOffTimerRef.current !== null) {
      clearTimeout(backOffTimerRef.current);
      backOffTimerRef.current = null;
    }
  }, []);

  /** Reset back-off state (refs, state, and any pending scheduled retry). */
  const clearBackOff = useCallback(() => {
    retryDelayMsRef.current = 0;
    retryAfterRef.current = null;
    setRetryAfter(null);
    clearBackOffTimer();
  }, [clearBackOffTimer]);

  /**
   * Advance the back-off delay, set the next retry window, and schedule a
   * timer to actually attempt the retry when that window elapses.
   * Called on every failed flush-and-pull cycle.  Refs and the state setter are all
   * stable, so this callback never needs to be recreated.
   */
  const scheduleBackOff = useCallback(() => {
    const nextDelay =
      retryDelayMsRef.current === 0
        ? INITIAL_BACK_OFF_MS
        : Math.min(retryDelayMsRef.current * 2, MAX_BACK_OFF_MS);
    retryDelayMsRef.current = nextDelay;
    retryAfterRef.current = Date.now() + nextDelay;
    setRetryAfter(retryAfterRef.current);

    clearBackOffTimer();
    backOffTimerRef.current = setTimeout(() => {
      backOffTimerRef.current = null;
      // `force` because the window has already elapsed by definition once
      // this timer fires — no need to re-check it, and forcing sidesteps any
      // Date.now() drift right at the boundary.
      flushAndPullRef.current?.(true, true).catch((err: unknown) => {
        logger.error("useOngoingSync: scheduled back-off retry failed:", err);
      });
    }, nextDelay);
  }, [clearBackOffTimer]);

  // Keep a stable ref to the latest pull callback so the flush closure does
  // not become stale when `onIncrementalPull` identity changes.
  const onIncrementalPullRef = useRef(onIncrementalPull);
  useEffect(() => {
    onIncrementalPullRef.current = onIncrementalPull;
  }, [onIncrementalPull]);

  // Guard: prevent concurrent flushes.
  const isFlushingRef = useRef(false);
  // Serialize concurrent enqueueChange calls so that two rapid mutations do
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

  /** Flush the outbox queue and then pull incremental changes.
   *
   * @param force - When true, bypass the exponential back-off delay and always
   *   attempt the flush immediately (e.g. after a real `online` reconnect).
   *   Defaults to false so that passive triggers (visibility change) respect
   *   the current back-off window.
   */
  const flushAndPull = useCallback(
    async (force = false, suppressUnauthorizedRedirect = false) => {
      if (!isActive || !userId || !fetchFn) return;
      if (isFlushingRef.current) return;
      // Respect back-off unless the caller explicitly forces a flush (e.g. the
      // `online` event after a real reconnect, or an SSE-triggered pull).
      if (
        !force &&
        retryAfterRef.current !== null &&
        Date.now() < retryAfterRef.current
      )
        return;
      isFlushingRef.current = true;
      setIsSyncing(true);
      try {
        const syncFetch: FetchFn = suppressUnauthorizedRedirect
          ? (url, init = {}) =>
              fetchFn(url, { ...init, suppressUnauthorizedRedirect: true })
          : fetchFn;

        // --- Flush outbox ---
        let flushConflicts = 0;
        // Set when this cycle hit a failure the pull cannot vindicate, so a
        // successful pull afterwards does not clear the error state.
        let suppressErrorReset = false;
        const dequeued = dequeueAndMergeSyncOutbox(userId);
        if (dequeued) {
          const { merged, commit } = dequeued;
          let outcome: PushOutcome;
          try {
            const syncCursor = localStorage.getItem(getSyncCursorKey(userId)) ?? undefined;
            outcome = await pushSyncPayloadDetailed(syncFetch, merged, syncCursor);
          } catch (err) {
            // Push threw (e.g. network error) — outbox stays intact for next retry.
            logger.error("useOngoingSync: outbox push threw:", err);
            if (!mountedRef.current) return;
            setOutboxCount(getSyncOutboxSize(userId));
            setHasSyncError(true);
            scheduleBackOff();
            return;
          }
          if (!mountedRef.current) return;
          if (!outcome.ok && outcome.permanent) {
            // The server will never accept this batch (a validation rejection,
            // or the bulk-delete guard). Leaving it queued would wedge the
            // outbox forever and block every later change behind it, so move
            // it aside — preserved and inspectable — and let sync carry on.
            logger.error(
              "useOngoingSync: outbox batch permanently rejected; quarantining",
              { userId, status: outcome.status },
            );
            // Only drop it from the outbox once it is safely somewhere else.
            // Quarantining and committing are the two halves of a move: if the
            // quarantine write fails (quota, private browsing) and the outbox
            // is cleared anyway, the batch exists in neither store and the
            // user's changes are simply gone. A wedged outbox is recoverable;
            // this is not, so the batch stays put when the move fails.
            suppressErrorReset = true;
            if (quarantineSyncChange(userId, merged, outcome.status)) {
              commit();
            } else {
              logger.error(
                "useOngoingSync: could not quarantine a rejected batch; leaving it in the outbox",
                { userId, status: outcome.status },
              );
              scheduleBackOff();
            }
            setOutboxCount(getSyncOutboxSize(userId));
            setQuarantineCount(getSyncQuarantineSize(userId));
            setHasSyncError(true);
            // No back-off on the success path: the failure is not transient,
            // and the outbox is empty now, so the next cycle has real work.
          } else if (!outcome.ok) {
            // Transient failure — outbox stays intact for the next retry.
            setOutboxCount(getSyncOutboxSize(userId));
            setHasSyncError(true);
            scheduleBackOff();
            return;
          }
          if (outcome.ok) {
            const pushResult = outcome.response;
            // Push succeeded — commit (clear) the outbox and continue to pull.
            commit();
            setOutboxCount(getSyncOutboxSize(userId));
            // Surface any conflicts from the outbox flush.
            flushConflicts = countPushConflicts(pushResult);
            if (flushConflicts > 0) {
              const extracted = extractConflictedItems(merged, pushResult);
              conflictedPayloadRef.current = extracted;
              conflictServerTimestampRef.current = maxConflictServerTimestamp(pushResult);
              setConflictedPayload(extracted);
              setConflictCount(flushConflicts);
            }
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
        const pullResult = await pullSyncData(syncFetch, cursor);
        if (!mountedRef.current) return;
        if (pullResult) {
          onIncrementalPullRef.current?.(pullResult);
          await reconcilePreferences(syncFetch);
          if (!mountedRef.current) return;
          storeSyncCursor(userId, pullResult.server_timestamp);
          setLastSyncedAt(pullResult.server_timestamp);
          // A pull succeeding says nothing about the batch that was just
          // refused — quarantined or still stuck in the outbox, those records
          // are not on the server and will not get there on their own. The
          // error state has to survive this cycle rather than being cleared by
          // unrelated progress.
          if (!suppressErrorReset) setHasSyncError(false);
          // Reset back-off on success.
          clearBackOff();
          if (flushConflicts === 0 && conflictedPayloadRef.current === null) {
            setConflictCount(0);
            setConflictedPayload(null);
          }
        } else {
          setHasSyncError(true);
          scheduleBackOff();
        }
      } finally {
        if (mountedRef.current) {
          setIsSyncing(false);
        }
        isFlushingRef.current = false;
      }
    },
    [isActive, userId, fetchFn, conflictCount, scheduleBackOff, clearBackOff],
  );

  // Keep a stable ref to the latest flushAndPull so the back-off timer
  // (scheduled outside React's render cycle) never calls a stale closure.
  useEffect(() => {
    flushAndPullRef.current = flushAndPull;
  }, [flushAndPull]);

  // Cancel any pending back-off retry on unmount so it doesn't fire (and
  // touch state) after the component is gone.
  useEffect(() => {
    return () => {
      clearBackOffTimer();
    };
  }, [clearBackOffTimer]);

  // Listen for reconnect and visibility-change events.
  useEffect(() => {
    if (!isActive) return;

    const handleOnline = () => {
      // The `online` event fires after a real reconnect — always attempt a
      // flush immediately, bypassing any active back-off window.
      flushAndPull(true, true).catch((err: unknown) => {
        logger.error("useOngoingSync: flush on online event failed:", err);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Passive trigger — respect the current back-off window.
        flushAndPull(false, true).catch((err: unknown) => {
          logger.error(
            "useOngoingSync: flush on visibility change failed:",
            err,
          );
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
    setLastSyncedAt(
      userId ? localStorage.getItem(getSyncCursorKey(userId)) : null,
    );
    setOutboxCount(userId ? getSyncOutboxSize(userId) : 0);
    setQuarantineCount(userId ? getSyncQuarantineSize(userId) : 0);
    setHasSyncError(false);
    setConflictCount(0);
    conflictedPayloadRef.current = null;
    setConflictedPayload(null);
    // Reset back-off (and cancel any pending scheduled retry for the
    // previous user) when the signed-in user changes.
    clearBackOff();
    hasRunInitialFlushRef.current = false;
  }, [userId, clearBackOff]);

  useEffect(() => {
    if (!isActive) return;
    if (hasRunInitialFlushRef.current) return;
    // Only run the initial flush if we are currently online.
    if (!navigator.onLine) return;
    hasRunInitialFlushRef.current = true;
    flushAndPull(true, true).catch((err: unknown) => {
      logger.error("useOngoingSync: initial flush on mount failed:", err);
    });
  }, [isActive, flushAndPull]);

  /**
   * Transport-neutral entry point for external callers (e.g. SSE listeners) to
   * trigger an incremental pull without knowing about cursor, outbox, or merge
   * logic.  Delegates to `flushAndPull`.
   */
  const triggerPull: TriggerPullFn = useCallback(() => {
    // Explicit external trigger (e.g. SSE signal) — bypass back-off so that
    // real server-push notifications are never silently dropped.
    flushAndPull(true, true).catch((err: unknown) => {
      logger.error("useOngoingSync: triggerPull failed:", err);
    });
  }, [flushAndPull]);

  /**
   * Push a single change payload to the server immediately.  Falls back to the
   * outbox queue if the push fails (e.g. device is offline).
   */
  const enqueueChange: EnqueueChangeFn = useCallback(
    (change: SyncPushPayload) => {
      if (!isActive || !userId || !fetchFn) return;

      const doEnqueue = async () => {
        // Recorded before the push so the post-push pull (below) can request
        // everything from this point forward — including any concurrent
        // change from another device that lands on the server while this
        // push is in flight.
        const cursorBeforePush = localStorage.getItem(getSyncCursorKey(userId)) ?? undefined;
        // Attempt an immediate push.
        const outcome = await pushSyncPayloadDetailed(fetchFn, change, cursorBeforePush);
        if (!outcome.ok && outcome.status === 410 && cursorBeforePush) {
          const replacement = await pullSyncData(fetchFn, cursorBeforePush);
          if (replacement?.full_resync_required) {
            onIncrementalPullRef.current?.(replacement);
            storeSyncCursor(userId, replacement.server_timestamp);
            setLastSyncedAt(replacement.server_timestamp);
          }
          quarantineSyncChange(userId, change, 410);
          if (!mountedRef.current) return;
          setQuarantineCount(getSyncQuarantineSize(userId));
          setHasSyncError(true);
          return;
        }
        const result = outcome.ok ? outcome.response : null;
        if (!result) {
          // Queue *before* the mounted check. Bailing out first (as this used
          // to) silently discarded the change whenever the provider unmounted
          // while the push was in flight — a tab closed or a sign-out landing
          // mid-request — and nothing would ever retry it: the outbox was
          // empty, so the write existed only in this device's memory and never
          // reached the server. Persisting first costs nothing when we are
          // still mounted (the flush path clears it) and is the whole reason
          // the outbox exists when we are not.
          const queued = appendToSyncOutbox(userId, change);
          if (!mountedRef.current) return;
          setOutboxCount(getSyncOutboxSize(userId));
          setHasSyncError(true);
          if (queued) {
            scheduleBackOff();
          } else {
            // localStorage rejected the write (quota, private browsing). The
            // change is now only in memory; say so rather than showing a
            // healthy sync state over data that will never be uploaded.
            logger.error(
              "useOngoingSync: change could not be persisted to the outbox",
              { userId },
            );
          }
          return;
        }
        if (!mountedRef.current) return;
        {
          // Detect conflicts — if any records were rejected, do a full pull (no
          // `since`) so that conflicted records are always included regardless of
          // where the local cursor sits relative to the server's `updated_at`.
          const conflicts = countPushConflicts(result);
          if (conflicts > 0) {
            const extracted = extractConflictedItems(change, result);
            conflictedPayloadRef.current = extracted;
            conflictServerTimestampRef.current =
              maxConflictServerTimestamp(result);
            setConflictedPayload(extracted);
            setConflictCount(conflicts);
            let pullResult: SyncPullResponse | null = null;
            try {
              pullResult = await pullSyncData(fetchFn);
            } catch (err) {
              // Reconciliation pull threw — surface as a sync error but do NOT requeue.
              logger.error("useOngoingSync: reconciliation pull threw:", err);
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
                await reconcilePreferences(fetchFn);
                if (!mountedRef.current) return;
                storeSyncCursor(userId, pullResult.server_timestamp);
                setLastSyncedAt(pullResult.server_timestamp);
                setHasSyncError(false);
              } catch (err) {
                // Post-success callback threw — log but do NOT requeue the change.
                logger.error(
                  "useOngoingSync: post-reconciliation callback threw:",
                  err,
                );
                if (mountedRef.current) {
                  setHasSyncError(true);
                }
              }
            } else {
              // Reconciliation pull failed — surface as a sync error.
              setHasSyncError(true);
            }
          } else {
            // Only clear conflict state when there is no pending unresolved conflict
            // from a prior push.  A new no-conflict push should not wipe a conflict
            // the user has not yet acknowledged.
            if (conflictedPayloadRef.current === null) {
              setConflictCount(0);
              setConflictedPayload(null);
            }
            // The cursor must only ever advance as the result of a pull that
            // has actually ingested every record up to that point. Fetching
            // just the status timestamp and storing it directly (as this used
            // to do) would silently and permanently skip any concurrent
            // change from another device landing between the old cursor and
            // that new timestamp — a pull is required here, not a status
            // check, even though this device's own push already applied
            // locally.
            let pullResult: SyncPullResponse | null = null;
            try {
              pullResult = await pullSyncData(fetchFn, cursorBeforePush);
            } catch (err) {
              logger.error("useOngoingSync: post-push pull threw:", err);
              if (mountedRef.current) {
                setHasSyncError(true);
              }
              return;
            }
            if (!mountedRef.current) return;
            if (pullResult) {
              try {
                onIncrementalPullRef.current?.(pullResult);
                storeSyncCursor(userId, pullResult.server_timestamp);
                setLastSyncedAt(pullResult.server_timestamp);
                setHasSyncError(false);
              } catch (err) {
                logger.error("useOngoingSync: post-push incremental-pull callback threw:", err);
                if (mountedRef.current) {
                  setHasSyncError(true);
                }
              }
            } else {
              setHasSyncError(true);
            }
          }
        }
      };

      // Chain onto the serialization queue.  Each task handles its own errors
      // so the chain never rejects and does not block later enqueue calls.
      enqueueQueueRef.current = enqueueQueueRef.current.then(async () => {
        try {
          await doEnqueue();
        } catch (err) {
          logger.error(
            "useOngoingSync: enqueueChange threw unexpectedly:",
            { userId, change },
            err,
          );
          // On unexpected error, queue the change so it is not lost.
          if (mountedRef.current) {
            appendToSyncOutbox(userId, change);
            setOutboxCount(getSyncOutboxSize(userId));
          }
        }
      });
    },
    [isActive, userId, fetchFn, scheduleBackOff],
  );

  /**
   * Resolve the pending ongoing-sync conflict.
   *
   * - `"keep-server"`: accept the server's version — clears conflict state without re-pushing.
   * - `"keep-mine"`: re-push the conflicted local items with bumped timestamps so they win
   *   the next last-write-wins check on the server.
   */
  const resolveOngoingConflicts: ResolveOngoingConflictsFn = useCallback(
    (choice) => {
      const payload = conflictedPayloadRef.current;
      const serverFloor = conflictServerTimestampRef.current;
      // Clear conflict state immediately regardless of choice.
      conflictedPayloadRef.current = null;
      conflictServerTimestampRef.current = undefined;
      setConflictedPayload(null);
      setConflictCount(0);

      if (choice === "keep-mine" && payload) {
        // Re-push with timestamps bumped to max(server_updated_at, now) so the
        // local version wins the LWW check even if the local clock is behind the server.
        enqueueChange(bumpClientTimestamps(payload, serverFloor));
      }
    },
    [enqueueChange],
  );

  if (!isActive) {
    return {
      isSyncing: false,
      lastSyncedAt: null,
      outboxCount: 0,
      quarantineCount: 0,
      hasSyncError: false,
      conflictCount: 0,
      conflictedPayload: null,
      retryAfter: null,
      enqueueChange: NOOP,
      triggerPull: NOOP,
      resolveOngoingConflicts: NOOP,
    };
  }

  return {
    isSyncing,
    lastSyncedAt,
    outboxCount,
    quarantineCount,
    hasSyncError,
    conflictCount,
    conflictedPayload,
    retryAfter,
    enqueueChange,
    triggerPull,
    resolveOngoingConflicts,
  };
}
