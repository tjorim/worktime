/**
 * IndexedDB persistence for the sync-backed TanStack DB collections.
 *
 * Without this, every syncable domain (tasks, labels, templates, time-off,
 * gantt tasks, work locations) lives only in memory. That makes three ordinary
 * situations look like data loss:
 *
 *  - a signed-out user refreshing the page loses everything they entered;
 *  - a signed-in user opening the installed PWA offline gets an empty app;
 *  - every cold start shows an empty app until a network round-trip completes.
 *
 * ## Why snapshots rather than persisting the query cache
 *
 * The obvious approach — persisting the TanStack Query cache — restores
 * asynchronously while the collections start fetching, and the collection
 * `queryFn` writes its result into the same cache entry. Whether the restored
 * data or an empty first fetch wins is a race, and in local-only mode the
 * `queryFn` returns the (not-yet-hydrated, empty) collection, so the query
 * meant to load the user's data is what erases it.
 *
 * Snapshotting each collection separately avoids the race: hydration is a
 * promise the `queryFn` awaits, and the snapshot is returned *as* the query
 * result, so the rows enter the collection through the library's normal sync
 * path. (Seeding with `utils.writeInsert` instead does populate `toArray`, but
 * `useLiveQuery` subscribers never render those rows — the query result is what
 * the collection treats as its state.)
 *
 * ## Lifecycle
 *
 * - `hydrateSyncCollections()` runs once at startup, reads every snapshot into
 *   memory, and resolves `whenHydrated`.
 * - Each collection is then subscribed, and any change (local mutation, server
 *   pull, SSE direct write) schedules a debounced snapshot write.
 * - `purgeSnapshotsOnOwnerChange` drops snapshots that belong to a different
 *   account.
 */

import { del, get, getMany, set, setMany, update } from "idb-keyval";
import {
  SYNC_COLLECTION_SNAPSHOT_GENERATION_KEY,
  SYNC_COLLECTION_SNAPSHOT_KEY_PREFIX,
  SYNC_COLLECTION_SNAPSHOT_OWNER_KEY,
} from "@/constants/storageKeys";
import { logger } from "@/utils/logger";

/**
 * Bumped when a stored snapshot's shape changes, so incompatible snapshots are
 * discarded rather than hydrated into collections that cannot read them.
 */
const SNAPSHOT_VERSION = 1;

const ANONYMOUS_OWNER = "anonymous";

/** Initial namespace used until an account transition creates a unique generation. */
const DEFAULT_GENERATION = "default";

/** How long to coalesce rapid changes before writing a snapshot. */
const WRITE_DEBOUNCE_MS = 500;

const SNAPSHOT_CHANNEL_NAME = "worktime_collection_snapshots";

interface StoredSnapshot {
  version: number;
  items: unknown[];
}

/** Minimal surface this module needs from a collection. */
export interface PersistableCollection<T> {
  readonly toArray: T[];
  subscribeChanges(callback: () => void): { unsubscribe: () => void };
}

export type SnapshotItemKey = (collectionName: string, item: unknown) => string;

let activeGeneration = DEFAULT_GENERATION;

function snapshotKey(name: string, generation = activeGeneration): string {
  const generationPrefix = generation === DEFAULT_GENERATION ? "" : `${generation}_`;
  return `${SYNC_COLLECTION_SNAPSHOT_KEY_PREFIX}${generationPrefix}${name}`;
}

function createSnapshotGeneration(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readSnapshot(name: string): Promise<unknown[] | null> {
  try {
    const stored = await get<StoredSnapshot>(snapshotKey(name));
    if (!stored || stored.version !== SNAPSHOT_VERSION || !Array.isArray(stored.items)) {
      return null;
    }
    return stored.items;
  } catch (err) {
    logger.error(`Failed to read the "${name}" snapshot:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

let hydrationPromise: Promise<void> | null = null;
const loadedSnapshots = new Map<string, unknown[]>();

/**
 * Resolves once the snapshots have been read from IndexedDB (or immediately if
 * hydration was never started, so tests and non-browser contexts do not hang).
 *
 * Every collection `queryFn` awaits this before deciding what to return, which
 * is what makes the ordering deterministic instead of a race.
 */
export function whenHydrated(): Promise<void> {
  return hydrationPromise ?? Promise.resolve();
}

/**
 * The snapshot loaded for a collection, if any.
 *
 * Returned by `queryFn` so the persisted rows enter the collection through the
 * library's normal sync path. Seeding via `utils.writeInsert` instead does put
 * rows in `toArray`, but `useLiveQuery` subscribers never render them — the
 * query result is what the collection treats as its state.
 */
export function getLoadedSnapshot<T>(name: string): T[] | null {
  const items = loadedSnapshots.get(name);
  return items !== undefined ? (items as T[]) : null;
}

/**
 * Forget the snapshots held in memory.
 *
 * The IndexedDB keys and this map are two copies of the same data, so purging
 * one without the other leaves the previous account's records reachable: a
 * failed pull for the *new* account falls back to `getLoadedSnapshot`, which
 * would still be serving the old one's rows.
 */
export function clearLoadedSnapshots(): void {
  loadedSnapshots.clear();
}

/**
 * Read every collection's snapshot into memory.
 *
 * Safe to call more than once — subsequent calls return the original promise.
 */
export function hydrateSyncCollections(collectionNames: string[]): Promise<void> {
  hydrationPromise ??= (async () => {
    try {
      activeGeneration =
        (await get<string>(SYNC_COLLECTION_SNAPSHOT_GENERATION_KEY)) ?? DEFAULT_GENERATION;
    } catch (err) {
      logger.error("Failed to read the snapshot generation:", err);
      activeGeneration = DEFAULT_GENERATION;
    }
    await Promise.all(
      collectionNames.map(async (name) => {
        const items = await readSnapshot(name);
        if (items !== null) loadedSnapshots.set(name, items);
      }),
    );
  })();
  return hydrationPromise;
}

// ---------------------------------------------------------------------------
// Change subscriptions
// ---------------------------------------------------------------------------

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const subscriptions: Array<{ unsubscribe: () => void }> = [];
const baselines = new Map<string, Map<string, string>>();
const pendingWrites = new Map<string, Promise<void>>();
let snapshotChannel: BroadcastChannel | null = null;

function fingerprints(
  name: string,
  items: unknown[],
  getItemKey: SnapshotItemKey,
): Map<string, string> {
  return new Map(
    items.map((item) => [getItemKey(name, item), JSON.stringify(item) ?? "undefined"]),
  );
}

async function mergeSnapshotChanges(
  name: string,
  items: unknown[],
  getItemKey: SnapshotItemKey,
): Promise<void> {
  const generation = activeGeneration;
  const previous = baselines.get(name) ?? new Map<string, string>();
  const current = new Map(items.map((item) => [getItemKey(name, item), item]));
  const currentFingerprints = fingerprints(name, items, getItemKey);
  const deletions = new Set([...previous.keys()].filter((key) => !current.has(key)));
  const upserts = new Map(
    [...current].filter(
      ([key, item]) => previous.get(key) !== (JSON.stringify(item) ?? "undefined"),
    ),
  );

  let mergedItems = items;
  await update<StoredSnapshot>(snapshotKey(name, generation), (stored) => {
    const persisted =
      stored?.version === SNAPSHOT_VERSION && Array.isArray(stored.items) ? stored.items : [];
    const merged = new Map(persisted.map((item) => [getItemKey(name, item), item]));
    for (const key of deletions) merged.delete(key);
    for (const [key, item] of upserts) merged.set(key, item);
    mergedItems = [...merged.values()];
    return { version: SNAPSHOT_VERSION, items: mergedItems };
  });

  baselines.set(name, currentFingerprints);
  loadedSnapshots.set(name, mergedItems);
  snapshotChannel?.postMessage({ type: "snapshot_changed", name, generation });
}

function openSnapshotChannel(): void {
  if (snapshotChannel || typeof BroadcastChannel === "undefined") return;
  snapshotChannel = new BroadcastChannel(SNAPSHOT_CHANNEL_NAME);
  snapshotChannel.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (
      !message ||
      typeof message !== "object" ||
      !("type" in message) ||
      message.type !== "snapshot_changed" ||
      !("name" in message) ||
      typeof message.name !== "string" ||
      !("generation" in message) ||
      message.generation !== activeGeneration
    ) {
      return;
    }
    const name = message.name;
    void readSnapshot(name).then((items) => {
      if (items) loadedSnapshots.set(name, items);
      else loadedSnapshots.delete(name);
    });
  };
}

function scheduleSnapshot(
  name: string,
  read: () => unknown[],
  getItemKey: SnapshotItemKey,
): void {
  const pending = timers.get(name);
  if (pending) clearTimeout(pending);
  timers.set(
    name,
    setTimeout(() => {
      timers.delete(name);
      const queued = (pendingWrites.get(name) ?? Promise.resolve())
        .then(() => mergeSnapshotChanges(name, read(), getItemKey))
        .catch((err: unknown) => {
          // Storage unavailable or over quota. Persistence is an enhancement —
          // the app keeps working from memory — but a silent failure here means
          // the next reload looks like data loss, so it is always logged.
          logger.error(`Failed to write the "${name}" snapshot:`, err);
        })
        .finally(() => {
          if (pendingWrites.get(name) === queued) pendingWrites.delete(name);
        });
      pendingWrites.set(name, queued);
    }, WRITE_DEBOUNCE_MS),
  );
}

/**
 * Persist every future change to the given collections.
 *
 * Subscribes rather than hooking the mutation handlers so that server pulls and
 * SSE direct writes are captured too — those never go through onInsert/onUpdate
 * /onDelete, and they are most of what a synced device writes.
 */
export function startPersistingSyncCollections(
  collections: Record<string, PersistableCollection<never>>,
  getItemKey: SnapshotItemKey,
): void {
  if (subscriptions.length > 0) return;
  openSnapshotChannel();
  for (const [name, collection] of Object.entries(collections)) {
    baselines.set(
      name,
      fingerprints(name, loadedSnapshots.get(name) ?? [], getItemKey),
    );
    try {
      subscriptions.push(
        collection.subscribeChanges(() => {
          scheduleSnapshot(name, () => collection.toArray, getItemKey);
        }),
      );
    } catch (err) {
      logger.error(`Failed to subscribe to the "${name}" collection:`, err);
    }
  }
}

/** Stop persisting, cancel timers, and drain writes already in progress. */
export async function stopPersistingSyncCollections(): Promise<void> {
  for (const subscription of subscriptions.splice(0)) {
    subscription.unsubscribe();
  }
  for (const timer of timers.values()) clearTimeout(timer);
  timers.clear();
  await Promise.allSettled([...pendingWrites.values()]);
  baselines.clear();
  pendingWrites.clear();
  snapshotChannel?.close();
  snapshotChannel = null;
}

/** Reset hydration state. Intended for tests. */
export function resetHydrationForTests(): void {
  hydrationPromise = null;
  loadedSnapshots.clear();
  activeGeneration = DEFAULT_GENERATION;
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

/**
 * Discard snapshots when they stop belonging to the current user.
 *
 * Snapshots are one per-device store, so a device shared by two people would
 * otherwise show the previous user's records to the next one — and hand them to
 * the first-sync flow as "local data" to upload into the new account.
 *
 * The transition *out* of anonymous is deliberately exempt: data entered before
 * signing in belongs to the person signing in, and uploading it is exactly what
 * first sync is for.
 *
 * | Previous → new | Purge? |
 * |---|---|
 * | anonymous → user A | no — it is A's data, and first sync uploads it |
 * | user A → user A | no |
 * | user A → user B | yes |
 * | user A → anonymous (sign-out) | yes — do not leave A's records on a signed-out device |
 *
 * A purge clears the in-memory snapshots as well as the stored ones. They are
 * two copies of the same records and the pull fallback reads the in-memory one.
 */
export async function purgeSnapshotsOnOwnerChange(
  userId: string | null,
  collectionNames: string[],
): Promise<boolean> {
  const owner = userId ?? ANONYMOUS_OWNER;
  try {
    const [previous, storedGeneration] = await getMany<string>([
      SYNC_COLLECTION_SNAPSHOT_OWNER_KEY,
      SYNC_COLLECTION_SNAPSHOT_GENERATION_KEY,
    ]);
    const persistedGeneration = storedGeneration ?? DEFAULT_GENERATION;
    if (previous === owner) {
      if (persistedGeneration === activeGeneration) return false;

      // Another tab already completed this owner transition. Stop using this
      // tab's stale namespace and force the same reload used by the initiating
      // tab so its retained live collection rows are discarded too.
      await stopPersistingSyncCollections();
      clearLoadedSnapshots();
      activeGeneration = persistedGeneration;
      return true;
    }

    const purge = previous !== undefined && previous !== ANONYMOUS_OWNER;
    if (purge) {
      // Stop this tab before changing namespaces. Writes already running finish
      // against the old generation and are deleted below; other tabs retain
      // that generation and therefore cannot write into the new owner's keys.
      await stopPersistingSyncCollections();
      // Both copies, or neither: the in-memory map is what the pull fallback
      // reads, so leaving it populated would let the previous account's rows
      // render in this one's session the first time a pull fails.
      clearLoadedSnapshots();
      const previousGeneration = activeGeneration;
      const nextGeneration = createSnapshotGeneration();
      await Promise.all(
        collectionNames.map((name) => del(snapshotKey(name, previousGeneration))),
      );
      await setMany([
        [SYNC_COLLECTION_SNAPSHOT_OWNER_KEY, owner],
        [SYNC_COLLECTION_SNAPSHOT_GENERATION_KEY, nextGeneration],
      ]);
      activeGeneration = nextGeneration;
      return true;
    }
    await set(SYNC_COLLECTION_SNAPSHOT_OWNER_KEY, owner);
    return purge;
  } catch (err) {
    logger.error("Failed to check the snapshot owner:", err);
    return false;
  }
}
