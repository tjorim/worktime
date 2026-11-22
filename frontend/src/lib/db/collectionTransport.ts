import type { SyncPullResponse, SyncPushPayload, SyncPushResponse } from "@/api-types";
import { getLoadedSnapshot, whenHydrated } from "@/lib/db/persistence";
import { logger } from "@/lib/logger";
import {
  SYNC_WRITE_ACTIVITY_EVENT,
  appendToPendingSyncOutbox,
  appendToSyncOutbox,
} from "@/lib/sync/syncOutbox";
import { countPushConflicts, reportTaskRejections } from "@/lib/sync/syncRequests";

let _currentUserId: string | null = null;
let _currentAccessToken: string | null = null;

export function updateSyncCollectionSession(userId: string | null, accessToken: string | null) {
  if (_currentUserId === userId && _currentAccessToken === accessToken) return null;
  const previousUserId = _currentUserId;
  _currentUserId = userId;
  _currentAccessToken = accessToken;
  return { previousUserId };
}

export function isSyncCollectionAuthResolving(): boolean {
  return _isAuthResolving;
}

export function hasSyncCollectionAuth(): boolean {
  return _currentUserId !== null;
}

/** The current signed-in sync user's id, or null when not signed in. */
export function getSyncCollectionUserId(): string | null {
  return _currentUserId;
}

// Whether AuthContext's own OIDC session check is still in flight (true only
// while an *existing* session is loading on page load, not for a settled
// signed-out/local-only state). Gates the pending-outbox queuing below: on a
// shared device, queuing every unauthenticated write - not just ones made
// during this narrow resolving window - would let a later, unrelated sign-in
// silently claim and upload someone else's local-only data. AuthProvider
// registers this via setSyncCollectionAuthResolving.
let _isAuthResolving = false;

export function setSyncCollectionAuthResolving(isResolving: boolean): void {
  _isAuthResolving = isResolving;
}

// A successful push here (see pushAndQueue) applies locally via the mutation's
// own optimistic write, but does nothing to refresh `lastSyncedAt`/outbox
// state in OngoingSyncContext — those only move on an actual pull. Left
// alone, the sync status badge would only catch up once *something else*
// (the SSE `sync_changed` round-trip for this same push, a tab
// visibility/online event, ...) happens to trigger one, which can leave it
// showing a stale "last synced" time well after a change was saved.
// `OngoingSyncProvider` registers its `triggerPull` here so a successful
// direct push can request an immediate refresh instead of waiting on that.
let _triggerPull: (() => void) | null = null;

/**
 * Register the sync provider's `triggerPull` so collection mutation handlers
 * can request an immediate pull after a successful push. Call with `null` on
 * unmount/deauth.
 */
export function setSyncCollectionTriggerPull(fn: (() => void) | null): void {
  _triggerPull = fn;
}

export function requestSyncCollectionPull(): void {
  _triggerPull?.();
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

/**
 * Perform a fetch request against the configured sync API base URL.
 * Injects the OIDC Bearer token when one is available.
 */
export async function collectionFetch(url: string, init?: RequestInit): Promise<Response> {
  const fullUrl =
    typeof window === "undefined" ? url : new URL(url, window.location.origin).toString();
  const headers = new Headers(init?.headers);
  if (_currentAccessToken) {
    headers.set("Authorization", `Bearer ${_currentAccessToken}`);
  }
  return fetch(fullUrl, { ...init, headers });
}

/**
 * Fetch the full sync snapshot for the signed-in user.
 *
 * Throws on any non-ok response so TanStack Query keeps the collection's last
 * good data and retries.  Returning `[]` here instead (as this used to) makes
 * a expired token, a 502 during a deploy, or any other transient server error
 * indistinguishable from "this account has no records": every collection
 * empties out, the user is shown an app with their history apparently wiped,
 * and — worse — anything that reads `collection.toArray` as the local truth
 * (see `buildLocalSyncPushPayload`) would treat that empty snapshot as the
 * state to replicate back to the server.
 */
export async function fetchSyncSnapshot(): Promise<SyncPullResponse> {
  const response = await collectionFetch("/api/sync/pull");
  if (!response.ok) {
    throw new Error(`sync pull failed: ${response.status}`);
  }
  return (await response.json()) as SyncPullResponse;
}

/**
 * Fetch a collection's server rows, falling back to its persisted snapshot.
 *
 * TanStack Query keeps the last good data when a refetch throws, which covers
 * a *warm* failure. It cannot cover a cold start: after a reload there is no
 * last-good data in memory, so an unreachable server (offline, a deploy, an
 * expired token) would render an empty app over a full local history. The
 * snapshot is that history, so it is what the user sees until the server is
 * reachable again.
 *
 * Rethrows when there is no snapshot — an error keeps the collection empty and
 * retrying, which is honest, where returning `[]` would assert the account is
 * empty.
 */
async function fetchWithSnapshotFallback<T>(
  name: string,
  select: (data: SyncPullResponse) => T[],
  current: () => T[],
): Promise<T[]> {
  try {
    return select(await fetchSyncSnapshot());
  } catch (err) {
    // What the collection already holds beats the snapshot: the snapshot is
    // the cold-start seed, frozen at load, while the collection includes
    // everything written since. Returning the snapshot over a populated
    // collection would roll back the user's offline edits on screen — they
    // are still queued in the outbox and would come back on the next
    // successful pull, but watching entries vanish is exactly the "the app
    // lost my work" moment this is all meant to prevent.
    const live = current();
    if (live.length > 0) {
      logger.error(`sync pull for "${name}" failed; keeping the current local rows:`, err);
      return live;
    }
    const snapshot = getLoadedSnapshot<T>(name);
    if (snapshot) {
      logger.error(`sync pull for "${name}" failed; showing the last saved copy:`, err);
      return snapshot;
    }
    throw err;
  }
}

interface SnapshotBackedCollection<T> {
  readonly toArray: T[];
}

export async function syncQueryFn<T>(
  name: string,
  collection: SnapshotBackedCollection<T>,
  select: (data: SyncPullResponse) => T[],
): Promise<T[]> {
  await whenHydrated();
  const current = () => collection.toArray;
  if (!_currentUserId) {
    const items = current();
    return items.length > 0 ? items : (getLoadedSnapshot<T>(name) ?? items);
  }
  return fetchWithSnapshotFallback(name, select, current);
}
/**
 * Push a single-domain sync payload to the server.
 * On failure (network error or non-ok response), enqueues to the per-user
 * outbox so the change is retried on the next sync flush.
 *
 * Does NOT throw — the caller (onInsert/onUpdate/onDelete) keeps the optimistic
 * update regardless of push outcome (Option A offline strategy).
 */
export async function pushAndQueue(payload: SyncPushPayload): Promise<void> {
  // No authenticated sync user yet. Only queue to the pending outbox while
  // an *existing* session is actively resolving (_isAuthResolving) - the
  // write is very likely this same about-to-be-authenticated user's own.
  // Genuine local-only usage and a settled signed-out state both leave
  // _isAuthResolving false, so those writes stay purely local as before:
  // queuing them too would let a later, unrelated sign-in on a shared
  // device silently claim and upload someone else's local-only data.
  // appendToPendingSyncOutbox holds a resolving-window write until
  // drainPendingSyncOutbox moves it into the real outbox once
  // setSyncCollectionAuth learns who this is.
  if (!_currentUserId) {
    if (_isAuthResolving) {
      appendToPendingSyncOutbox(payload);
    }
    return;
  }

  const writeUserId = _currentUserId;
  const notifyActivity = (delta: number) =>
    window.dispatchEvent(
      new CustomEvent(SYNC_WRITE_ACTIVITY_EVENT, { detail: { userId: writeUserId, delta } }),
    );
  notifyActivity(1);
  try {
    const response = await collectionFetch("/api/sync/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`sync push failed: ${response.status}`);
    }
    const result = (await response.json()) as SyncPushResponse;
    reportTaskRejections(result);
    if (countPushConflicts(result) > 0) {
      // Preserve rejected local edits for the existing conflict-resolution flow.
      appendToSyncOutbox(writeUserId, payload);
    }
    // Refresh lastSyncedAt/outbox/error state right away rather than leaving
    // the sync status badge stale until an unrelated trigger happens to pull.
    requestSyncCollectionPull();
  } catch {
    // Push failed — enqueue to outbox for retry on next sync cycle.
    appendToSyncOutbox(writeUserId, payload);
  } finally {
    notifyActivity(-1);
  }
}

/**
 * `pushAndQueue`, then fold the mutation into the collection's base state.
 *
 * A query collection drops a mutation's optimistic layer when its handler
 * resolves, so something has to write the change into the synced rows or it
 * would vanish (offline and signed-out edits have no server copy to refetch).
 * A whole-snapshot refetch from inside a handler can apply a
 * stale snapshot over a later mutation. Writing the mutation's own rows
 * directly is exact; the server's view still arrives through the pull that
 * `pushAndQueue` triggers.
 */
export async function pushAndCommit<TItem extends object>(
  payload: SyncPushPayload,
  {
    collection,
    transaction,
  }: {
    collection: {
      utils: {
        writeUpsert: (item: TItem) => Promise<void>;
        writeDelete: (key: string | number) => Promise<void>;
      };
    };
    transaction: {
      mutations: ReadonlyArray<{ type: string; key: string | number; modified: TItem }>;
    };
  },
): Promise<void> {
  await pushAndQueue(payload);
  for (const m of transaction.mutations) {
    if (m.type !== "delete") {
      await collection.utils.writeUpsert(m.modified);
      continue;
    }
    try {
      await collection.utils.writeDelete(m.key);
    } catch (err) {
      // A pull may already have removed the row; the delete is then done.
      if (!(err instanceof Error && err.name === "DeleteOperationItemNotFoundError")) throw err;
    }
  }
}
