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
 *    Pull all server data into the collection-backed local state; store the cursor.
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
  appendToSyncOutbox,
  applyPreferencesPull,
  buildKeepLocalReplacePayload,
  buildLocalPreferencesPayload,
  buildLocalSyncPushPayload,
  countPushConflicts,
  extractConflictedItems,
  fetchPreferences,
  fetchSyncStatus,
  hasSyncCursor,
  pullSyncData,
  pushPreferences,
  pushSyncPayload,
  reconcilePreferences,
  storeSyncCursor,
  syncStatusHasEntityData,
  type FetchFn,
  type SyncPullResponse,
  type SyncPushPayload,
  type SyncStatusResponse,
} from "@/utils/syncClient";
import {
  applyPullToCollections,
  mergePullIntoCollections,
  preloadSyncCollections,
} from "@/db/collections";
import { logger } from "@/utils/logger";
import {
  countSyncPayloadEntities,
  createSyncAttemptDiagnostics,
  reportSyncDiagnostic,
  trackSyncRequests,
  type SyncAttemptDiagnostics,
  type SyncDiagnosticPhase,
} from "@/utils/syncDiagnostics";

export type FirstSyncPhase =
  /** Not authenticated, or sync already set up — nothing to do. */
  | "idle"
  /** Querying the backend for its sync status. */
  | "checking"
  /** Both local and server have data — waiting for the user to pick a resolution. */
  | "conflict"
  /** Uploading local data to the server (Branch A or user chose "keep local"). */
  | "pushing"
  /** Downloading server data into the collection-backed local state (Branch B or user chose "use server"). */
  | "pulling"
  /** Flow completed successfully. */
  | "done"
  /** An error occurred; local data is unchanged. */
  | "error";

/**
 * How the user chose to resolve a first-sync conflict.
 *
 * `keep-both` is the only non-destructive option, and the one the dialog
 * defaults to.  Every syncable entity is keyed by a client-generated id
 * (or, for work locations, by date), so merging the two sides is well defined:
 * push the local records as creates, delete nothing, then pull.  Duplicates
 * end up visible and removable; records do not end up gone.
 */
export type ConflictChoice = "keep-both" | "keep-local" | "use-server";

/** Record counts for each side of a first-sync conflict, for the dialog to show. */
export interface FirstSyncConflictCounts {
  local: number;
  server: number;
}

export interface UseFirstSyncFlowResult {
  /** Current phase of the first-sync flow. */
  phase: FirstSyncPhase;
  /**
   * True when the sync cursor for this user exists in localStorage,
   * meaning the first-sync flow has been completed on this device.
   * Use this flag to activate ongoing sync in the caller.
   */
  isSyncEstablished: boolean;
  /** When `phase === "conflict"`, call this with the user's choice to proceed. */
  resolveConflict: (choice: ConflictChoice) => void;
  /**
   * When `phase === "conflict"`, how many records each side holds — so the
   * user can see what the destructive options would remove instead of
   * choosing blind.  Null in every other phase.
   */
  conflictCounts: FirstSyncConflictCounts | null;
  /** Dismiss the flow (valid in "conflict" or "error" phases). Sets phase back to "idle". */
  dismiss: () => void;
}

/** Total number of records across every entity list in a push payload. */
function countPayloadRecords(payload: SyncPushPayload): number {
  return (
    payload.labels.length +
    payload.tasks.length +
    payload.templates.length +
    payload.work_locations.length +
    payload.time_off_entries.length +
    payload.gantt_tasks.length
  );
}

/** Returns true when the push payload contains at least one syncable record. */
function payloadHasData(payload: SyncPushPayload): boolean {
  return countPayloadRecords(payload) > 0;
}

/** Total number of *live* records in a pull response (tombstones excluded). */
function countServerRecords(data: SyncPullResponse): number {
  const live = <T extends { deleted_at: string | null }>(rows: T[] | undefined) =>
    (rows ?? []).filter((row) => row.deleted_at === null).length;
  return (
    live(data.labels) +
    live(data.tasks) +
    live(data.templates) +
    live(data.work_locations) +
    live(data.time_off_entries) +
    live(data.gantt_tasks)
  );
}

/**
 * Read the local collections as a push payload, after making sure they have
 * actually finished loading.
 *
 * Returns null when the collections could not be loaded.  Callers must treat
 * that as "the local state is unknown" and refuse to act, never as "there is
 * no local data": the two are identical in `collection.toArray`, and acting on
 * the wrong one is what turns a failed fetch into a request to delete the
 * account's records.
 */
async function readLocalSyncPayload(): Promise<SyncPushPayload | null> {
  try {
    await preloadSyncCollections();
  } catch (err) {
    logger.error("useFirstSyncFlow: local collections failed to load:", err);
    return null;
  }
  try {
    return buildLocalSyncPushPayload();
  } catch (err) {
    logger.error("useFirstSyncFlow: failed to build the local sync payload:", err);
    return null;
  }
}

type MountedCheck = () => boolean;

/**
 * Push local user preferences to the server if they exist in unified user state storage.
 * Returns false and does nothing if `mounted()` returns false (component unmounted).
 */
async function pushLocalPreferencesIfPresent(
  fetch: FetchFn,
  mounted: MountedCheck,
): Promise<boolean> {
  const prefsPayload = buildLocalPreferencesPayload();
  if (!prefsPayload) return true; // nothing to push — not a failure
  const pushed = await pushPreferences(fetch, prefsPayload.data, prefsPayload.clientUpdatedAt);
  if (!mounted()) return false;
  return pushed;
}

/**
 * Pull server preferences and apply them to unified user state storage if the server has any.
 * Returns false if `mounted()` returns false after the fetch (component unmounted).
 */
async function pullAndApplyServerPreferencesIfPresent(
  fetch: FetchFn,
  mounted: MountedCheck,
): Promise<boolean> {
  const serverPrefs = await fetchPreferences(fetch);
  if (!mounted()) return false;
  if (serverPrefs) {
    applyPreferencesPull(serverPrefs.data);
  }
  return true;
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
  // Server state pulled when the flow reached Branch C, reused by
  // resolveConflict so no branch has to re-fetch it.
  const capturedServerDataRef = useRef<SyncPullResponse | null>(null);
  const [conflictCounts, setConflictCounts] = useState<FirstSyncConflictCounts | null>(null);
  // Tracks whether the hook is still active. Set to false on unmount so
  // in-flight async operations do not call setPhase on a stale instance.
  const mountedRef = useRef(true);
  // Lock to prevent concurrent resolveConflict executions.
  const conflictResolutionForUserRef = useRef<string | null>(null);
  const diagnosticsRef = useRef<SyncAttemptDiagnostics | null>(null);
  const diagnosticPhaseRef = useRef<SyncDiagnosticPhase>("status");

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

      const diagnostics = createSyncAttemptDiagnostics();
      diagnosticsRef.current = diagnostics;
      const syncFetch = trackSyncRequests(fetch, diagnostics);

      diagnosticPhaseRef.current = "status";
      const status = await fetchSyncStatus(syncFetch);
      // Bail if the component unmounted or auth changed while we were awaiting.
      if (!mountedRef.current || flowStartedForUser.current !== uid) return;
      if (!status) {
        reportSyncDiagnostic(fetch, diagnostics, {
          event: "sync_failure",
          phase: diagnosticPhaseRef.current,
          code: "status_unavailable",
        });
        setPhase("error");
        return;
      }

      // Preferences are deliberately excluded from both sides of this
      // comparison. They are a single last-write-wins blob that reconciles by
      // timestamp on its own, so they can never require the user to choose
      // between local and server data — while counting them would drag nearly
      // every sign-in into the conflict branch, since the settings blob exists
      // on every device that has ever opened the app. The conflict question is
      // only ever about entities.
      const serverHasData = syncStatusHasEntityData(status);
      // Build the push payload once so both the localHasData check and Branch A
      // use the same filtered dataset (malformed rows are excluded by the builder).
      diagnosticPhaseRef.current = "local_read";
      const localPayload = await readLocalSyncPayload();
      if (!mountedRef.current || flowStartedForUser.current !== uid) return;
      if (!localPayload) {
        // The local side is unknown, so every branch below would be a guess.
        reportSyncDiagnostic(fetch, diagnostics, {
          event: "sync_failure",
          phase: diagnosticPhaseRef.current,
          code: "local_payload_unavailable",
        });
        setPhase("error");
        return;
      }
      const localHasData = payloadHasData(localPayload);

      // Branch D — no entities anywhere. Preferences may still exist on either
      // side, so reconcile them rather than leaving local settings unsynced.
      if (!localHasData && !serverHasData) {
        diagnosticPhaseRef.current = "preferences";
        await reconcilePreferences(syncFetch);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        diagnosticPhaseRef.current = "cursor";
        storeSyncCursor(uid, status.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch A — server empty, local has data → push entities + preferences
      if (localHasData && !serverHasData) {
        setPhase("pushing");
        diagnosticPhaseRef.current = "push";
        const result = await pushSyncPayload(syncFetch, localPayload);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        if (!result) {
          reportSyncDiagnostic(fetch, diagnostics, {
            event: "sync_failure",
            phase: diagnosticPhaseRef.current,
            code: "push_failed",
            entityCounts: countSyncPayloadEntities(localPayload),
          });
          setPhase("error");
          return;
        }
        // Preferences follow their own last-write-wins reconciliation rather
        // than the entity branch: an account with no entities can still hold
        // newer settings from another device, and pushing this device's copy
        // unconditionally would overwrite them.
        diagnosticPhaseRef.current = "preferences";
        await reconcilePreferences(syncFetch);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        // Fetch the updated server_timestamp after the push so the cursor
        // reflects the post-push server state. Fall back to the pre-push
        // timestamp (still a valid server timestamp) if the re-fetch fails.
        diagnosticPhaseRef.current = "status";
        const newStatus = await fetchSyncStatus(syncFetch);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        diagnosticPhaseRef.current = "cursor";
        storeSyncCursor(uid, newStatus?.server_timestamp ?? status.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch B — server has data, local is empty → pull entities + preferences
      if (!localHasData && serverHasData) {
        setPhase("pulling");
        diagnosticPhaseRef.current = "pull";
        const pullResult = await pullSyncData(syncFetch);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        if (!pullResult) {
          reportSyncDiagnostic(fetch, diagnostics, {
            event: "sync_failure",
            phase: diagnosticPhaseRef.current,
            code: "pull_failed",
          });
          setPhase("error");
          return;
        }
        diagnosticPhaseRef.current = "local_apply";
        applyPullToCollections(pullResult);
        // Reconcile preferences by timestamp rather than taking the server's
        // copy outright: this device having no entities says nothing about
        // whether its settings are older than the account's.
        diagnosticPhaseRef.current = "preferences";
        await reconcilePreferences(syncFetch);
        if (!mountedRef.current || flowStartedForUser.current !== uid) return;
        diagnosticPhaseRef.current = "cursor";
        storeSyncCursor(uid, pullResult.server_timestamp);
        setPhase("done");
        return;
      }

      // Branch C — both have data → show conflict dialog.
      // Capture the status so resolveConflict can use it as a cursor fallback
      // without an extra /db/sync/status call.
      capturedStatusRef.current = status;

      // Pull the server side now rather than after the user chooses. Every
      // branch of the dialog needs this data anyway (keep-both and use-server
      // apply it; keep-local needs it to know what to tombstone), so fetching
      // it up front costs no extra request — and it is the only way to tell
      // the user how much data each option would discard before they commit.
      diagnosticPhaseRef.current = "pull";
      const serverData = await pullSyncData(syncFetch);
      if (!mountedRef.current || flowStartedForUser.current !== uid) return;
      if (!serverData) {
        reportSyncDiagnostic(fetch, diagnostics, {
          event: "sync_failure",
          phase: diagnosticPhaseRef.current,
          code: "conflict_snapshot_failed",
        });
        setPhase("error");
        return;
      }
      capturedServerDataRef.current = serverData;
      setConflictCounts({
        local: countPayloadRecords(localPayload),
        server: countServerRecords(serverData),
      });
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
      const diagnostics = diagnosticsRef.current ?? createSyncAttemptDiagnostics();
      diagnosticsRef.current = diagnostics;
      const fetch = trackSyncRequests(fetchFn, diagnostics);
      let diagnosticPhase: SyncDiagnosticPhase = "local_read";

      const execute = async () => {
        // Lock the conflict resolution to this user.
        conflictResolutionForUserRef.current = uid;
        try {
          if (choice === "keep-both") {
            // The non-destructive merge: upload the local records and delete
            // nothing, then take the server's union back down. Every entity is
            // keyed by a client-generated id, so neither side can clobber the
            // other — at worst the user ends up with duplicates they can see
            // and remove, rather than records they cannot get back.
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            setPhase("pushing");
            const localPayload = await readLocalSyncPayload();
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!localPayload) {
              reportSyncDiagnostic(fetchFn, diagnostics, {
                event: "sync_failure",
                phase: diagnosticPhase,
                code: "local_payload_unavailable",
              });
              setPhase("error");
              return;
            }
            diagnosticPhase = "push";
            const pushed = await pushSyncPayload(fetch, localPayload);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!pushed) {
              reportSyncDiagnostic(fetchFn, diagnostics, {
                event: "sync_failure",
                phase: diagnosticPhase,
                code: "push_failed",
                entityCounts: countSyncPayloadEntities(localPayload),
              });
              setPhase("error");
              return;
            }
            const pushConflictCount = countPushConflicts(pushed);
            if (pushConflictCount > 0) {
              // Preserve rejected local versions before applying the server
              // snapshot. Once the cursor is stored, ongoing sync flushes this
              // outbox and presents the existing per-record conflict resolver.
              const conflicted = extractConflictedItems(localPayload, pushed);
              reportSyncDiagnostic(fetchFn, diagnostics, {
                event: "sync_conflict",
                phase: diagnosticPhase,
                code: "records_rejected",
                conflictCount: pushConflictCount,
                entityCounts: countSyncPayloadEntities(conflicted),
              });
              if (!appendToSyncOutbox(uid, conflicted)) {
                reportSyncDiagnostic(fetchFn, diagnostics, {
                  event: "sync_failure",
                  phase: "local_apply",
                  code: "conflict_preservation_failed",
                  conflictCount: pushConflictCount,
                  entityCounts: countSyncPayloadEntities(conflicted),
                });
                setPhase("error");
                return;
              }
            }
            setPhase("pulling");
            diagnosticPhase = "pull";
            const merged = await pullSyncData(fetch);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!merged) {
              reportSyncDiagnostic(fetchFn, diagnostics, {
                event: "sync_failure",
                phase: diagnosticPhase,
                code: "merged_pull_failed",
                conflictCount: pushConflictCount,
              });
              setPhase("error");
              return;
            }
            // "Keep everything" is a union: add/update live server rows, but
            // never infer that a local-only row should be deleted merely
            // because it is absent from this snapshot.
            diagnosticPhase = "local_apply";
            mergePullIntoCollections(merged);
            // Neither side was chosen over the other, so preferences fall back
            // to their own last-write-wins reconciliation.
            diagnosticPhase = "preferences";
            await reconcilePreferences(fetch);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            diagnosticPhase = "cursor";
            storeSyncCursor(uid, merged.server_timestamp);
            setPhase("done");
          } else if (choice === "keep-local") {
            // Server state was already pulled when the dialog was raised; fall
            // back to a fresh pull only if that is somehow missing.
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            setPhase("pulling");
            const serverData = capturedServerDataRef.current ?? (await pullSyncData(fetch));
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!serverData) {
              setPhase("error");
              return;
            }
            setPhase("pushing");
            const localPayload = await readLocalSyncPayload();
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!localPayload) {
              setPhase("error");
              return;
            }
            // Build a replace payload: local creates + delete entries for
            // server-only rows.  Throws EmptyLocalReplaceError if the local
            // side turned out to be empty after all, which would make this a
            // pure delete-everything batch — surfaced as an error rather than
            // sent.
            let replacePayload: SyncPushPayload;
            try {
              replacePayload = buildKeepLocalReplacePayload(localPayload, serverData);
            } catch (err) {
              logger.error("useFirstSyncFlow: refusing to replace server data:", err);
              setPhase("error");
              return;
            }
            const result = await pushSyncPayload(fetch, replacePayload);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!result) {
              setPhase("error");
              return;
            }
            // Push local preferences to the server (keep-local means local wins).
            const prefsPushed = await pushLocalPreferencesIfPresent(
              fetch,
              () => mountedRef.current && flowStartedForUser.current === uid,
            );
            if (!prefsPushed) {
              if (!mountedRef.current || flowStartedForUser.current !== uid) return;
              setPhase("error");
              return;
            }
            const postStatus = await fetchSyncStatus(fetch);
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            const cursor = postStatus?.server_timestamp ?? serverData.server_timestamp;
            if (!cursor) {
              setPhase("error");
              return;
            }
            storeSyncCursor(uid, cursor);
            setPhase("done");
          } else {
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            setPhase("pulling");
            // Reuse the snapshot taken when the dialog was raised.
            const pullResult = capturedServerDataRef.current ?? (await pullSyncData(fetch));
            if (!mountedRef.current || flowStartedForUser.current !== uid) return;
            if (!pullResult) {
              setPhase("error");
              return;
            }
            applyPullToCollections(pullResult);
            // Pull preferences from the server (use-server means server wins).
            const prefsMounted = await pullAndApplyServerPreferencesIfPresent(
              fetch,
              () => mountedRef.current && flowStartedForUser.current === uid,
            );
            if (!prefsMounted) return;
            storeSyncCursor(uid, pullResult.server_timestamp);
            setPhase("done");
          }
        } finally {
          // Always clear the lock, even on error.
          conflictResolutionForUserRef.current = null;
        }
      };

      execute().catch((err: unknown) => {
        reportSyncDiagnostic(fetchFn, diagnostics, {
          event: "sync_failure",
          phase: diagnosticPhase,
          code: "conflict_resolution_exception",
          error: err,
        });
        if (mountedRef.current) setPhase("error");
      });
    },
    [phase, userId, fetchFn],
  );

  const dismiss = useCallback(() => {
    setPhase("idle");
    capturedStatusRef.current = null;
    capturedServerDataRef.current = null;
    setConflictCounts(null);
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
      capturedServerDataRef.current = null;
      setConflictCounts(null);
    }
  }, [isAuthenticated]);

  // Trigger the flow when the user becomes authenticated.
  useEffect(() => {
    if (!isAuthenticated || !userId || !fetchFn) return;

    runFlow(userId, fetchFn).catch((err: unknown) => {
      const diagnostics = diagnosticsRef.current ?? createSyncAttemptDiagnostics();
      reportSyncDiagnostic(fetchFn, diagnostics, {
        event: "sync_failure",
        phase: diagnosticPhaseRef.current,
        code: "first_sync_exception",
        error: err,
      });
      setPhase("error");
    });
  }, [isAuthenticated, userId, fetchFn, runFlow]);

  // isSyncEstablished is true when:
  //  a) The first-sync flow just finished (phase === "done"), OR
  //  b) A cursor already existed when the component mounted (phase === "idle" with cursor present)
  const isSyncEstablished =
    phase === "done" || (phase === "idle" && userId !== null && hasSyncCursor(userId));

  return { phase, isSyncEstablished, resolveConflict, conflictCounts, dismiss };
}
