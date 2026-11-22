import {
  getSyncOutboxKey,
  getSyncQuarantineKey,
  SYNC_PENDING_OUTBOX_KEY,
} from "@/config/storageKeys";
import { dayjs } from "@/lib/dates/dateTimeUtils";
import { logger } from "@/lib/logger";

import type { SyncPushPayload } from "@/api-types";
import { countPayloadDeletes, dedupeByKey } from "@/lib/sync/syncRequests";

function readSyncOutbox(userId: string): SyncPushPayload[] {
  try {
    const raw = localStorage.getItem(getSyncOutboxKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncPushPayload[]) : [];
  } catch (err) {
    logger.error("Failed to read sync outbox from localStorage:", err);
    return [];
  }
}

function writeSyncOutbox(userId: string, outbox: SyncPushPayload[]): void {
  localStorage.setItem(getSyncOutboxKey(userId), JSON.stringify(outbox));
}

/**
 * Append a single change payload to the outbox queue stored in localStorage.
 * Called when an immediate push fails (e.g. offline).
 *
 * Note: entries are not coalesced at append time — each failed write is
 * stored as a separate item.  Rapid offline mutations to the same record
 * produce multiple entries; dequeueAndMergeSyncOutbox coalesces them by
 * natural key (keeping the newest) before the flush is sent.
 */
export const SYNC_WRITE_ACTIVITY_EVENT = "worktime-sync-write-activity";
export const SYNC_OUTBOX_CHANGED_EVENT = "worktime-sync-outbox-changed";

export function appendToSyncOutbox(userId: string, change: SyncPushPayload): boolean {
  try {
    const outbox = readSyncOutbox(userId);
    outbox.push(change);
    writeSyncOutbox(userId, outbox);
    window.dispatchEvent(new CustomEvent(SYNC_OUTBOX_CHANGED_EVENT, { detail: userId }));
    return true;
  } catch (err) {
    // Storage rejected the write (quota exceeded, private browsing). Report it
    // rather than swallowing: this is the only durable record that the change
    // still needs uploading, so a silent failure here means the write lives in
    // memory only while the UI keeps showing a healthy, fully-synced state.
    logger.error("Failed to append to sync outbox:", err);
    return false;
  }
}

/**
 * Clear the outbox queue for the given user. Call after a successful flush.
 */
export function clearSyncOutbox(userId: string): void {
  localStorage.removeItem(getSyncOutboxKey(userId));
}

// ---------------------------------------------------------------------------
// Pending outbox (writes made before the current user is known)
// ---------------------------------------------------------------------------

/**
 * Cap on retained pending entries, matching MAX_QUARANTINED_CHANGES's role:
 * this is meant to bridge a short startup window before auth resolves, not
 * to accumulate forever. A user who never signs in on this device would
 * otherwise grow it without bound, since nothing ever drains it for them.
 */
const MAX_PENDING_SYNC_OUTBOX = 200;

/**
 * Append a change made while no user is authenticated yet - not a network
 * failure, but auth simply hasn't resolved (e.g. a write made in the brief
 * window while an existing OIDC session is still loading on page load).
 *
 * Without this, such a write is silently kept as a local-only optimistic
 * row with nothing recording that it still needs to reach the server - so
 * once auth resolves and the collections' next server pull runs, that pull
 * has no record of it and quietly discards it. drainPendingSyncOutbox moves
 * these into the real per-user outbox as soon as a user is known, giving
 * them the same retry safety net as an ordinary network failure.
 */
export function appendToPendingSyncOutbox(change: SyncPushPayload): boolean {
  try {
    const raw = localStorage.getItem(SYNC_PENDING_OUTBOX_KEY);
    const pending: SyncPushPayload[] = raw ? (JSON.parse(raw) as SyncPushPayload[]) : [];
    pending.push(change);
    localStorage.setItem(
      SYNC_PENDING_OUTBOX_KEY,
      JSON.stringify(pending.slice(-MAX_PENDING_SYNC_OUTBOX)),
    );
    return true;
  } catch (err) {
    logger.error("Failed to append to the pending (pre-auth) sync outbox:", err);
    return false;
  }
}

/**
 * Move every pending pre-auth write into the now-known user's real outbox,
 * clearing the pending queue. Call as soon as a user becomes known (before
 * anything else touches sync state) so these writes are queued for the
 * normal outbox flush before any pull can run.
 */
export function drainPendingSyncOutbox(userId: string): void {
  try {
    const raw = localStorage.getItem(SYNC_PENDING_OUTBOX_KEY);
    if (!raw) return;
    const pending: SyncPushPayload[] = JSON.parse(raw) as SyncPushPayload[];
    if (pending.length > 0) {
      // One write for the whole batch, merged with whatever the real outbox
      // already holds: either it all lands, or writeSyncOutbox throws (e.g.
      // quota) and the catch below leaves the pending queue intact rather
      // than clearing it out from under a write that never landed.
      writeSyncOutbox(userId, [...readSyncOutbox(userId), ...pending]);
    }
    localStorage.removeItem(SYNC_PENDING_OUTBOX_KEY);
  } catch (err) {
    logger.error("Failed to drain the pending (pre-auth) sync outbox:", err);
  }
}

/**
 * Drop every pending pre-auth write without moving it anywhere. Call when an
 * existing OIDC session's resolution finishes without producing an
 * authenticated user (no session was found, or silent renewal failed) -
 * those writes can't be attributed to anyone, so leaving them queued would
 * let a different, later sign-in on the same device silently drain and
 * upload them as its own via drainPendingSyncOutbox.
 */
export function discardPendingSyncOutbox(): void {
  localStorage.removeItem(SYNC_PENDING_OUTBOX_KEY);
}

// ---------------------------------------------------------------------------
// Quarantine (permanently rejected changes)
// ---------------------------------------------------------------------------

/** A batch the server will never accept, kept so its contents are recoverable. */
export interface QuarantinedChange {
  quarantinedAt: string;
  status: number | null;
  payload: SyncPushPayload;
}

/**
 * Cap on retained quarantine entries.  Bounded so a client stuck in a
 * rejection loop cannot fill localStorage and start failing the outbox writes
 * that everything else depends on.
 */
const MAX_QUARANTINED_CHANGES = 20;

export function readSyncQuarantine(userId: string): QuarantinedChange[] {
  try {
    const raw = localStorage.getItem(getSyncQuarantineKey(userId));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuarantinedChange[]) : [];
  } catch (err) {
    logger.error("Failed to read sync quarantine from localStorage:", err);
    return [];
  }
}

/**
 * Set aside a batch the server permanently refused.
 *
 * The alternative to quarantining is one of two bad outcomes: retry it forever
 * (the outbox never drains, so every *later* change is stuck behind it and
 * never reaches the server) or drop it (the change is gone with no trace).
 * Moving it aside keeps sync flowing for everything else while preserving the
 * rejected records, so they can be inspected or re-applied rather than
 * silently lost.
 */
export function quarantineSyncChange(
  userId: string,
  payload: SyncPushPayload,
  status: number | null,
): boolean {
  try {
    const existing = readSyncQuarantine(userId);
    existing.push({ quarantinedAt: dayjs().toISOString(), status, payload });
    localStorage.setItem(
      getSyncQuarantineKey(userId),
      JSON.stringify(existing.slice(-MAX_QUARANTINED_CHANGES)),
    );
    return true;
  } catch (err) {
    // Reported rather than swallowed: the caller clears the outbox once this
    // succeeds, so a silent failure here would drop the batch from both
    // durable stores at once.
    logger.error("Failed to quarantine a rejected sync change:", err);
    return false;
  }
}

/** Number of permanently-rejected batches currently held aside. */
export function getSyncQuarantineSize(userId: string): number {
  return readSyncQuarantine(userId).length;
}

/** Discard the quarantined batches for the given user. */
export function clearSyncQuarantine(userId: string): void {
  localStorage.removeItem(getSyncQuarantineKey(userId));
}

/**
 * Return the number of pending entries in the outbox queue.
 */
export function getSyncOutboxSize(userId: string): number {
  return readSyncOutbox(userId).length;
}

/**
 * Merge all pending outbox payloads into a single SyncPushPayload ready to
 * send via pushSyncPayload().  Returns null when the outbox is empty.
 *
 * The outbox is **not** cleared by this call.  After a successful push the
 * caller must invoke the returned `commit` function to remove the dequeued
 * entries.  If the push fails the outbox is left intact and will be retried
 * on the next flush cycle.
 *
 * `commit` only removes the entries present in this snapshot (matched by
 * content, not position) rather than clearing the whole key. The outbox is
 * append-only, so any entry written by a concurrent `appendToSyncOutbox`
 * while this batch's push is in flight lands after the snapshot and survives
 * the commit instead of being silently dropped. Matching by content (rather
 * than dropping a fixed count from the front) also keeps a second, overlapping
 * flush safe — e.g. two browser tabs for the same user, which aren't
 * serialized against each other since `isFlushingRef` is in-memory per tab:
 * if tab A's commit has already removed the snapshot it dequeued, tab B's
 * later commit finds none of *its* snapshot entries still present and removes
 * nothing, rather than deleting whatever now occupies that position.
 *
 * Entries are coalesced by natural key (id, or date for work locations),
 * keeping only the newest entry per record.  This is safe because every
 * queued mutation carries the full record and the server upserts by natural
 * key, and it keeps long-offline flushes bounded by the number of *distinct*
 * records rather than the number of mutations.
 *
 * `allow_bulk_delete` is OR-combined across entries: if any queued payload
 * opted in (e.g. a "keep local" replace queued after its immediate push
 * failed — see `buildKeepLocalReplacePayload`), the merged batch carries the
 * opt-in too, and `declared_delete_total` is recomputed from the merged
 * result. Dropping either on a retry would let the server's bulk-delete guard
 * reject deletes the user already confirmed, silently leaving those records
 * (and anything they depended on being gone) back on the server.
 */
export function dequeueAndMergeSyncOutbox(
  userId: string,
): { merged: SyncPushPayload; commit: () => void } | null {
  const outbox = readSyncOutbox(userId);
  if (outbox.length === 0) return null;

  const merged: SyncPushPayload = {
    labels: [],
    tasks: [],
    templates: [],
    work_locations: [],
    time_off_entries: [],
    gantt_tasks: [],
  };
  let allowBulkDelete = false;
  for (const payload of outbox) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    merged.labels.push(...(Array.isArray(payload.labels) ? payload.labels : []));
    merged.tasks.push(...(Array.isArray(payload.tasks) ? payload.tasks : []));
    merged.templates.push(...(Array.isArray(payload.templates) ? payload.templates : []));
    merged.work_locations.push(
      ...(Array.isArray(payload.work_locations) ? payload.work_locations : []),
    );
    merged.time_off_entries.push(
      ...(Array.isArray(payload.time_off_entries) ? payload.time_off_entries : []),
    );
    merged.gantt_tasks.push(...(Array.isArray(payload.gantt_tasks) ? payload.gantt_tasks : []));
    if (payload.allow_bulk_delete) allowBulkDelete = true;
  }
  const mergedResult: SyncPushPayload = {
    labels: dedupeByKey(merged.labels, (l) => l.id),
    tasks: dedupeByKey(merged.tasks, (t) => t.id),
    templates: dedupeByKey(merged.templates, (t) => t.id),
    work_locations: dedupeByKey(merged.work_locations, (w) => w.date),
    time_off_entries: dedupeByKey(merged.time_off_entries, (e) => e.id),
    gantt_tasks: dedupeByKey(merged.gantt_tasks, (g) => g.id),
  };
  if (allowBulkDelete) {
    mergedResult.allow_bulk_delete = true;
    mergedResult.declared_delete_total = countPayloadDeletes(mergedResult);
  }
  return {
    merged: mergedResult,
    commit: () => {
      // Remove exactly the dequeued entries, matched by content rather than
      // position, so a concurrent commit (a second tab, or anything else
      // that raced this snapshot) never removes an entry it didn't dequeue.
      // Tracked as a multiset (key -> remaining count) rather than an
      // indexOf/splice scan per entry, so this stays O(n) instead of O(n*m).
      const toRemoveCounts = new Map<string, number>();
      for (const entry of outbox) {
        const key = JSON.stringify(entry);
        toRemoveCounts.set(key, (toRemoveCounts.get(key) ?? 0) + 1);
      }
      const current = readSyncOutbox(userId);
      const remaining: SyncPushPayload[] = [];
      for (const entry of current) {
        const key = JSON.stringify(entry);
        const count = toRemoveCounts.get(key);
        if (count) {
          toRemoveCounts.set(key, count - 1);
        } else {
          remaining.push(entry);
        }
      }
      try {
        writeSyncOutbox(userId, remaining);
      } catch (err) {
        // The push already succeeded. Report the failed prune rather than
        // reporting the whole flush as failed.
        logger.error("Failed to prune committed entries from the sync outbox:", err);
      }
    },
  };
}
