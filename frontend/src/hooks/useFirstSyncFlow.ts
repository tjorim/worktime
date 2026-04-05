/**
 * useFirstSyncFlow
 *
 * Orchestrates the one-time first-sync flow that runs when a user signs in
 * and the device needs to establish an initial synced state.
 *
 * Flow summary (per docs/local-first-sync-flow.md §2):
 *
 *  1. User becomes authenticated (`isAuthenticated` transitions to `true`).
 *  2. Skip if a sync cursor already exists for this user (sync already set up).
 *  3. Check local syncable data presence.
 *  4. Call GET /db/sync/status to check server state.
 *
 *  Branch A — server empty + local data exists:
 *    Push all local data to the server; store the returned sync cursor.
 *
 *  Branch B — server has data + local is empty:
 *    Pull all server data to localStorage; store the cursor.
 *
 *  Branch C — both have data:
 *    Surface the conflict to the user (phase = "conflict").
 *    When the user resolves the conflict, execute the chosen action.
 *
 *  Branch D — neither has data:
 *    Nothing to do; transition to "done" immediately.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  applySyncPullResponse,
  buildKeepLocalReplacePayload,
  buildLocalSyncPushPayload,
  fetchSyncStatus,
  pullSyncData,
  pushSyncPayload,
  syncStatusHasData,
  type SyncPushPayload,
  type SyncStatusResponse,
} from "../utils/syncClient";
import { getSyncCursorKey } from "../constants/storageKeys";

export type FirstSyncPhase =
  /** Not authenticated, or sync already set up — nothing to do. */
  | "idle"
  /** Querying the backend for its sync status. */
  | "checking"
  /** Both local and server have data — waiting for the user to pick a resolution. */
  | "conflict"
  /** Uploading local data to the server (Branch A or user chose "keep local"). */
  | "pushing"
  /** Downloading server data to localStorage (Branch B or user chose "use server"). */
  | "pulling"
  /** Flow completed successfully. */
  | "done"
  /** An error occurred; local data is unchanged. */
  | "error";

export type ConflictChoice = "keep-local" | "use-server";

export interface UseFirstSyncFlowResult {
  /** Current phase of the first-sync flow. */
  phase: FirstSyncPhase;
  /** When `phase === "conflict"`, call this with the user's choice to proceed. */
  resolveConflict: (choice: ConflictChoice) => void;
  /** Dismiss the flow (valid in "conflict" or "error" phases). Sets phase back to "idle". */
  dismiss: () => void;
}

/**
 * Returns true if the given userId already has a sync cursor stored locally,
 * meaning the first-sync flow has already been completed on this device.
 */
function hasSyncCursor(userId: string): boolean {
  return localStorage.getItem(getSyncCursorKey(userId)) !== null;
}

function storeSyncCursor(userId: string, serverTimestamp: string): void {
  localStorage.setItem(getSyncCursorKey(userId), serverTimestamp);
}

/** Returns true when the push payload contains at least one syncable record. */
function payloadHasData(payload: SyncPushPayload): boolean {
  return (
    payload.labels.length > 0 ||
    payload.tasks.length > 0 ||
    payload.templates.length > 0 ||
    payload.work_locations.length > 0
  );
}

export function useFirstSyncFlow(
  isAuthenticated: boolean,
  userId: string | null,
  fetchFn: ((url: string, init?: RequestInit) => Promise<Response>) | null,
): UseFirstSyncFlowResult {
  const [phase, setPhase] = useState<FirstSyncPhase>("idle");

  // Guard against running the flow more than once per mount when deps change.
  const flowStartedForUser = useRef<string | null>(null);
  // Status captured when the flow reaches Branch C; reused by resolveConflict
  // to avoid an extra /db/sync/status round-trip on "keep-local".
  const capturedStatusRef = useRef<SyncStatusResponse | null>(null);
  // Tracks whether the hook is still active. Set to false on unmount so
  // in-flight async operations do not call setPhase on a stale instance.
  const mountedRef = useRef(true);
  // Lock to prevent concurrent resolveConflict executions.
  const conflictResolutionForUserRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const runFlow = useCallback(
    async (uid: string, fetch: (url: string, init?: RequestInit) => Promise<Response>) => {
      // Skip if we already ran for this user in this session.
      if (flowStartedForUser.current === uid) return;
      // Skip if a sync cursor already exists for this user.
      if (hasSyncCursor(uid)) return;

      flowStartedForUser.current = uid;
      setPhase("checking");

      const status = await fetchSyncStatus(fetch);
      // Bail if the component unmounted or auth changed while we were awaiting.
      if (!mountedRef.current || flowStartedForUser.current !== uid) return;
      if (!status) {
        setPhase("error");
        return;
      }

      const serverHasData = syncStatusHasData(status);
      // Build the push payload once so both the localHasData check and Branch A
      // use the same filtered dataset (malformed rows are excluded by the builder).
      const localPayload = buildLocalSyncPushPayload();
      const localHasData = payloadHasData(localPayload);

      // Branch D — nothing anywhere
      if (!localHasData && !serverHasData) {
        storeSyncCursor(uid, status.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch A — server empty, local has data → push
      if (localHasData && !serverHasData) {
        setPhase("pushing");
        const result = await pushSyncPayload(fetch, localPayload);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        if (!result) {
          setPhase("error");
          return;
        }
        // Fetch the updated server_timestamp after the push so the cursor
        // reflects the post-push server state. Fall back to the pre-push
        // timestamp (still a valid server timestamp) if the re-fetch fails.
        const newStatus = await fetchSyncStatus(fetch);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        storeSyncCursor(uid, newStatus?.server_timestamp ?? status.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch B — server has data, local is empty → pull automatically
      if (!localHasData && serverHasData) {
        setPhase("pulling");
        const pullResult = await pullSyncData(fetch);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        if (!pullResult) {
          setPhase("error");
          return;
        }
        applySyncPullResponse(pullResult);
        storeSyncCursor(uid, pullResult.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch C — both have data → show conflict dialog.
      // Capture the status so resolveConflict can use it as a cursor fallback
      // without an extra /db/sync/status call.
      capturedStatusRef.current = status;
      setPhase("conflict");
    },
    [],
  );

  const resolveConflict = useCallback(
    (choice: ConflictChoice) => {
      if (phase !== "conflict" || !userId || !fetchFn) return;
      // Guard: return if conflict resolution is already in progress.
      if (conflictResolutionForUserRef.current !== null) return;

      const uid = userId;
      const fetch = fetchFn;
      // Use the status we already fetched when entering Branch C as the
      // fallback timestamp, avoiding an extra /db/sync/status round-trip.
      const preStatus = capturedStatusRef.current;

      const execute = async () => {
        // Lock the conflict resolution to this user.
        conflictResolutionForUserRef.current = uid;
        try {
          if (choice === "keep-local") {
            // Pull the current server state so we can tombstone server-only rows.
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            setPhase("pulling");
            const serverData = await pullSyncData(fetch);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!serverData) {
              setPhase("error");
              return;
            }
            setPhase("pushing");
            const localPayload = buildLocalSyncPushPayload();
            // Build a replace payload: local creates + delete entries for server-only rows.
            const replacePayload = buildKeepLocalReplacePayload(localPayload, serverData);
            const result = await pushSyncPayload(fetch, replacePayload);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!result) {
              setPhase("error");
              return;
            }
            const postStatus = await fetchSyncStatus(fetch);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            const cursor = postStatus?.server_timestamp ?? preStatus?.server_timestamp;
            if (!cursor) {
              setPhase("error");
              return;
            }
            storeSyncCursor(uid, cursor);
            setPhase("done");
          } else {
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            setPhase("pulling");
            const pullResult = await pullSyncData(fetch);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!pullResult) {
              setPhase("error");
              return;
            }
            applySyncPullResponse(pullResult);
            storeSyncCursor(uid, pullResult.server_timestamp);
            setPhase("done");
          }
        } finally {
          // Always clear the lock, even on error.
          conflictResolutionForUserRef.current = null;
        }
      };

      execute().catch(() => {
        if (mountedRef.current) setPhase("error");
      });
    },
    [phase, userId, fetchFn],
  );

  const dismiss = useCallback(() => {
    setPhase("idle");
    capturedStatusRef.current = null;
    // Reset so the flow can re-run on next sign-in or page reload.
    // It will not re-trigger automatically in the current session.
    flowStartedForUser.current = null;
    // Clear the conflict resolution lock.
    conflictResolutionForUserRef.current = null;
  }, []);

  // Reset the flow state when the user signs out.
  useEffect(() => {
    if (!isAuthenticated) {
      setPhase("idle");
      flowStartedForUser.current = null;
      conflictResolutionForUserRef.current = null;
    }
  }, [isAuthenticated]);

  // Trigger the flow when the user becomes authenticated.
  useEffect(() => {
    if (!isAuthenticated || !userId || !fetchFn) return;

    runFlow(userId, fetchFn).catch(() => {
      setPhase("error");
    });
  }, [isAuthenticated, userId, fetchFn, runFlow]);

  return { phase, resolveConflict, dismiss };
}
