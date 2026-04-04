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
import { checkBackupDataPresence } from "../utils/appBackup";
import {
  applySyncPullResponse,
  buildLocalSyncPushPayload,
  fetchSyncStatus,
  pullSyncData,
  pushSyncPayload,
  syncStatusHasData,
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

/** Returns true if there are any syncable records in localStorage. */
function hasLocalSyncableData(): boolean {
  const presence = checkBackupDataPresence();
  return (
    presence.hasTasks ||
    presence.hasTemplates ||
    presence.hasLabels ||
    presence.hasWorkLocations
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

  const runFlow = useCallback(
    async (uid: string, fetch: (url: string, init?: RequestInit) => Promise<Response>) => {
      // Skip if we already ran for this user in this session.
      if (flowStartedForUser.current === uid) return;
      // Skip if a sync cursor already exists for this user.
      if (hasSyncCursor(uid)) return;

      flowStartedForUser.current = uid;
      setPhase("checking");

      const status = await fetchSyncStatus(fetch);
      if (!status) {
        setPhase("error");
        return;
      }

      const serverHasData = syncStatusHasData(status);
      const localHasData = hasLocalSyncableData();

      // Branch D — nothing anywhere
      if (!localHasData && !serverHasData) {
        storeSyncCursor(uid, status.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch A — server empty, local has data → push
      if (localHasData && !serverHasData) {
        setPhase("pushing");
        const payload = buildLocalSyncPushPayload();
        const result = await pushSyncPayload(fetch, payload);
        if (!result) {
          setPhase("error");
          return;
        }
        // After push we need the latest server_timestamp; pull status again.
        const newStatus = await fetchSyncStatus(fetch);
        storeSyncCursor(uid, newStatus?.server_timestamp ?? status.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch B — server has data, local is empty → pull automatically
      if (!localHasData && serverHasData) {
        setPhase("pulling");
        const pullResult = await pullSyncData(fetch);
        if (!pullResult) {
          setPhase("error");
          return;
        }
        applySyncPullResponse(pullResult);
        storeSyncCursor(uid, pullResult.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch C — both have data → show conflict dialog
      setPhase("conflict");
    },
    [],
  );

  const resolveConflict = useCallback(
    (choice: ConflictChoice) => {
      if (phase !== "conflict" || !userId || !fetchFn) return;

      const uid = userId;
      const fetch = fetchFn;

      const execute = async () => {
        if (choice === "keep-local") {
          setPhase("pushing");
          const payload = buildLocalSyncPushPayload();
          const result = await pushSyncPayload(fetch, payload);
          if (!result) {
            setPhase("error");
            return;
          }
          const newStatus = await fetchSyncStatus(fetch);
          storeSyncCursor(uid, newStatus?.server_timestamp ?? new Date().toISOString());
          setPhase("done");
        } else {
          setPhase("pulling");
          const pullResult = await pullSyncData(fetch);
          if (!pullResult) {
            setPhase("error");
            return;
          }
          applySyncPullResponse(pullResult);
          storeSyncCursor(uid, pullResult.server_timestamp);
          setPhase("done");
        }
      };

      execute().catch(() => {
        setPhase("error");
      });
    },
    [phase, userId, fetchFn],
  );

  const dismiss = useCallback(() => {
    setPhase("idle");
    // Do NOT reset flowStartedForUser.current — the user chose to "decide later".
    // The flow will re-run next time they sign in (sign-out resets the ref).
  }, []);

  // Reset the flow state when the user signs out.
  useEffect(() => {
    if (!isAuthenticated) {
      setPhase("idle");
      flowStartedForUser.current = null;
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
