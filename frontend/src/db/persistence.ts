/**
 * Local persistence for the sync-backed TanStack DB collections.
 *
 * Without this, every syncable domain (tasks, labels, templates, time-off,
 * gantt tasks, work locations) lives only in memory. That makes three ordinary
 * situations look like data loss:
 *
 *  - a signed-out user refreshing the page loses everything they entered;
 *  - a signed-in user opening the installed PWA offline gets an empty app;
 *  - every cold start shows an empty app until a network round-trip completes.
 *
 * This module wires TanStack DB's first-class persistence
 * (`persistedCollectionOptions`, backed by WA-SQLite over OPFS in a dedicated
 * Web Worker) so persistence sits *inside* the sync pipe rather than hanging
 * off the side of it as a debounced mirror. The UI still reads the in-memory
 * collection; SQLite is read at hydration, never per render.
 *
 * ## Why a deferred adapter
 *
 * `openBrowserWASQLiteOPFSDatabase` is async, but the collections are created
 * at module scope and `persistedCollectionOptions` needs `persistence.adapter`
 * synchronously. So the exported persistence hands out an adapter whose every
 * method awaits the database open. Every `PersistenceAdapter` method already
 * returns a promise, so nothing observes the difference.
 *
 * The coordinator, by contrast, is constructed eagerly: it is BroadcastChannel
 * plus Web Locks and needs no database. `createBrowserWASQLitePersistence`
 * calls `coordinator.setAdapter()` once the database is open, and this tab
 * cannot claim leadership before then (leadership is requested from the
 * collection runtime, which is itself waiting on the same open), so there is no
 * window in which the coordinator serves a request without a real adapter.
 *
 * ## Multi-tab
 *
 * `BrowserCollectionCoordinator` does leader election over BroadcastChannel and
 * Web Locks so exactly one tab owns the SQLite writer, and followers route
 * their writes through it.
 *
 * That closes the two-tab gap when signed *in*. Signed out it does not: with no
 * server to pull from, each tab's `queryFn` returns its own memory and the query
 * collection applies that as the collection's complete state, truncating rows
 * another tab persisted in the same instant. See the "Known gap" section in
 * `docs/sync-data-safety.md` and issue #1045.
 *
 * ## Degrading
 *
 * Persistence is an enhancement, never a requirement. When OPFS or Web Workers
 * are unavailable (older iOS Safari, private browsing, the jsdom/happy-dom test
 * environment) the open fails and every collection falls back to
 * `UNAVAILABLE_ADAPTER` — a no-op that reports an empty store. The app then
 * behaves exactly as it did before any persistence existed, rather than
 * spraying rejected-promise warnings from the sync pipe.
 */

import {
  BrowserCollectionCoordinator,
  createBrowserWASQLitePersistence,
  openBrowserWASQLiteOPFSDatabase,
  type PersistedCollectionPersistence,
} from "@tanstack/browser-db-sqlite-persistence";
import {
  PERSISTED_COLLECTION_OWNER_KEY,
  PERSISTED_COLLECTION_PURGE_PENDING_KEY,
} from "@/constants/storageKeys";
import { logger } from "@/utils/logger";

/**
 * Bumped when a collection's stored row shape changes.
 *
 * A mismatch resets the persisted store rather than migrating it. That is safe
 * here because every collection is sync-present: the server re-supplies the
 * rows on the next pull.
 */
export const COLLECTION_SCHEMA_VERSION = 1;

/** OPFS file backing the persisted collections. */
const DATABASE_NAME = "worktime-collections.sqlite";

/** Namespace for the coordinator's BroadcastChannel and Web Lock names. */
const COORDINATOR_DB_NAME = "worktime-collections";

/** Recorded owner value for local-only (signed-out) use. */
const ANONYMOUS_OWNER = "anonymous";

/**
 * The adapter half of TanStack's persistence contract.
 *
 * Derived from the persistence type rather than imported from
 * `@tanstack/db-sqlite-persistence-core`, which is a transitive dependency the
 * browser package does not re-export this type from.
 */
type PersistenceAdapter = PersistedCollectionPersistence["adapter"];

type ResolveOptions = Parameters<
  NonNullable<PersistedCollectionPersistence["resolvePersistenceForCollection"]>
>[0];

/** The stream position of a store that has never been written to. */
const EMPTY_STREAM_POSITION = { latestTerm: 0, latestSeq: 0, latestRowVersion: 0 };

/**
 * Stand-in used when the database cannot be opened.
 *
 * Reports an empty store and accepts (discards) every write, so collections
 * hydrate to nothing and run purely from memory instead of failing.
 */
const UNAVAILABLE_ADAPTER: PersistenceAdapter = {
  loadSubset: () => Promise.resolve([]),
  applyCommittedTx: () => Promise.resolve(),
  loadCollectionMetadata: () => Promise.resolve([]),
  scanRows: () => Promise.resolve([]),
  ensureIndex: () => Promise.resolve(),
  markIndexRemoved: () => Promise.resolve(),
  getStreamPosition: () => Promise.resolve({ ...EMPTY_STREAM_POSITION }),
};

// ---------------------------------------------------------------------------
// Coordinator
// ---------------------------------------------------------------------------

/**
 * Whether this runtime can run leader election.
 *
 * Both halves are required, and the Web Locks half is not optional politeness:
 * `BrowserCollectionCoordinator` re-arms `acquireLeadership` as soon as its
 * lock request settles, so where `navigator.locks` is missing the request fails
 * immediately and the retry recurses until the stack overflows. Test
 * environments (happy-dom) and non-secure contexts are both in that category.
 */
function supportsLeaderElection(): boolean {
  return (
    typeof BroadcastChannel === "function" &&
    typeof navigator !== "undefined" &&
    typeof navigator.locks?.request === "function"
  );
}

/**
 * Constructed eagerly so leader election is live from module load.
 *
 * `null` where election cannot run; the persistence layer then falls back to
 * `SingleProcessCoordinator`, which is the correct behavior for a lone tab.
 */
const coordinator: BrowserCollectionCoordinator | null = supportsLeaderElection()
  ? new BrowserCollectionCoordinator({ dbName: COORDINATOR_DB_NAME })
  : null;

/** Release the coordinator's BroadcastChannel and Web Lock handles. */
export function disposePersistenceCoordinator(): void {
  coordinator?.dispose();
}

// ---------------------------------------------------------------------------
// Database open
// ---------------------------------------------------------------------------

function supportsOpfsPersistence(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.storage?.getDirectory === "function" &&
    typeof Worker === "function"
  );
}

/** The open database handle, kept so a purge can close it before deleting. */
let openedDatabase: { close?: () => Promise<void> | void } | null = null;

let openPromise: Promise<PersistedCollectionPersistence | null> | null = null;

/**
 * Ask the browser to exempt our storage from eviction under pressure.
 *
 * OPFS is best-effort by default: the browser may clear it whenever it wants
 * space back, which for this app means an offline launch showing an empty
 * screen — the exact failure persistence exists to prevent. Granting is at the
 * browser's discretion (Chrome decides from engagement signals, Firefox may
 * prompt), so this is a request, not a guarantee, and never blocks the open.
 */
function requestPersistentStorage(): void {
  if (typeof navigator.storage?.persist !== "function") return;
  void navigator.storage
    .persisted()
    .then((already) => (already ? true : navigator.storage.persist()))
    .catch((err: unknown) => {
      logger.error("Failed to request persistent storage:", err);
    });
}

/**
 * Open the OPFS database once, resolving to `null` when persistence is not
 * available in this runtime — or when a store that must be discarded still
 * cannot be deleted.
 *
 * Never rejects: a failure here must degrade the app, not break it.
 */
function openPersistence(): Promise<PersistedCollectionPersistence | null> {
  openPromise ??= (async () => {
    if (!supportsOpfsPersistence()) return null;
    // A purge that could not delete the file leaves this set — most often
    // because another tab still held the store open. Retry now that this load
    // owns nothing, and if it still cannot be removed, run from memory rather
    // than hydrate rows belonging to a different account.
    if (isPurgePending()) {
      if (!(await removeDatabaseFile())) {
        logger.error("Refusing to open the local store: it is still pending deletion.");
        return null;
      }
      setPurgePending(false);
    }
    requestPersistentStorage();
    try {
      const database = await openBrowserWASQLiteOPFSDatabase({
        databaseName: DATABASE_NAME,
      });
      openedDatabase = database;
      return createBrowserWASQLitePersistence({
        database,
        ...(coordinator ? { coordinator } : {}),
      });
    } catch (err) {
      // Private browsing, a storage-disabled profile, or a browser without
      // OPFS sync access handles. The app keeps working from memory, but a
      // silent failure means the next reload looks like data loss, so it is
      // always logged.
      logger.error("Local collection persistence is unavailable:", err);
      return null;
    }
  })();
  return openPromise;
}

/**
 * Resolves once the database open has settled, successfully or not.
 *
 * Collection `queryFn`s await this before deciding what to return, so a query
 * result cannot commit against a persistence layer that has not come up yet.
 */
export async function whenPersistenceReady(): Promise<void> {
  await openPersistence();
}

/** Resolve the adapter for one collection, or the no-op if unavailable. */
async function adapterFor(options: ResolveOptions): Promise<PersistenceAdapter> {
  const persistence = await openPersistence();
  if (!persistence) return UNAVAILABLE_ADAPTER;
  const resolved = persistence.resolvePersistenceForCollection?.(options) ?? persistence;
  return resolved.adapter;
}

/**
 * Wrap an eventual adapter in one usable synchronously.
 *
 * Optional methods are implemented unconditionally — the real SQLite adapter
 * provides all of them, and the persistence runtime feature-detects by property
 * presence, so omitting them here would silently disable metadata loading and
 * stream positions.
 */
function deferAdapter(resolve: () => Promise<PersistenceAdapter>): PersistenceAdapter {
  return {
    loadSubset: async (collectionId, options, ctx) =>
      (await resolve()).loadSubset(collectionId, options, ctx),
    applyCommittedTx: async (collectionId, tx) => {
      await (await resolve()).applyCommittedTx(collectionId, tx);
    },
    loadCollectionMetadata: async (collectionId) => {
      const adapter = await resolve();
      return (await adapter.loadCollectionMetadata?.(collectionId)) ?? [];
    },
    scanRows: async (collectionId, options) => {
      const adapter = await resolve();
      return (await adapter.scanRows?.(collectionId, options)) ?? [];
    },
    ensureIndex: async (collectionId, signature, spec) => {
      await (await resolve()).ensureIndex(collectionId, signature, spec);
    },
    markIndexRemoved: async (collectionId, signature) => {
      await (await resolve()).markIndexRemoved?.(collectionId, signature);
    },
    getStreamPosition: async (collectionId) => {
      const adapter = await resolve();
      return (await adapter.getStreamPosition?.(collectionId)) ?? { ...EMPTY_STREAM_POSITION };
    },
  };
}

function persistenceFor(options: ResolveOptions): PersistedCollectionPersistence {
  return {
    adapter: deferAdapter(() => adapterFor(options)),
    ...(coordinator ? { coordinator } : {}),
  };
}

/**
 * The persistence handed to every `persistedCollectionOptions` call.
 *
 * `resolvePersistenceForCollection` is invoked synchronously by
 * `persistedCollectionOptions` with the collection's id, mode and schema
 * version; forwarding those through keeps the underlying adapter cache keyed
 * the same way it would be without the deferral.
 */
export const syncCollectionPersistence: PersistedCollectionPersistence = {
  ...persistenceFor({
    collectionId: COORDINATOR_DB_NAME,
    mode: "sync-present",
    schemaVersion: COLLECTION_SCHEMA_VERSION,
  }),
  resolvePersistenceForCollection: (options) => persistenceFor(options),
  resolvePersistenceForMode: (mode) =>
    persistenceFor({
      collectionId: COORDINATOR_DB_NAME,
      mode,
      schemaVersion: COLLECTION_SCHEMA_VERSION,
    }),
};

// ---------------------------------------------------------------------------
// Startup race guard
// ---------------------------------------------------------------------------

/** The one transition this guard is allowed to swallow. */
function isCleanedUpBeforeReady(err: unknown): boolean {
  return (
    err instanceof Error &&
    err.name === "CollectionStateError" &&
    err.message.startsWith(`Invalid collection status transition from "cleaned-up" to "ready"`)
  );
}

interface SyncParamsLike {
  markReady: () => void;
}

interface SyncConfigLike {
  sync: (params: SyncParamsLike) => unknown;
}

/**
 * Make a persisted collection safe to tear down while it is still starting up.
 *
 * `persistedCollectionOptions` defers the collection's `markReady` behind its
 * asynchronous persisted startup, but does not re-check whether the collection
 * was cleaned up while that was in flight — it holds a `cleanedUp` flag and
 * consults it everywhere *except* there. A collection torn down mid-startup (a
 * component unmounting, a test file finishing) therefore throws
 * `InvalidCollectionStatusTransitionError` out of a floating promise, which
 * surfaces as an unhandled rejection and fails the whole test run even though
 * every assertion passed.
 *
 * The library never exposes that promise, so the callback it eventually invokes
 * is the only place this can be caught. Only the cleaned-up transition is
 * swallowed; anything else still throws.
 */
export function guardStartupMarkReady<TOptions extends { sync: unknown }>(
  options: TOptions,
): TOptions {
  const inner = options.sync as SyncConfigLike;
  return {
    ...options,
    sync: {
      ...inner,
      sync: (params: SyncParamsLike) =>
        inner.sync({
          ...params,
          markReady: () => {
            try {
              params.markReady();
            } catch (err) {
              if (!isCleanedUpBeforeReady(err)) throw err;
            }
          },
        }),
    },
  };
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

function readOwner(): string | null {
  try {
    return localStorage.getItem(PERSISTED_COLLECTION_OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(owner: string): void {
  try {
    localStorage.setItem(PERSISTED_COLLECTION_OWNER_KEY, owner);
  } catch (err) {
    logger.error("Failed to record the persisted collection owner:", err);
  }
}

function isPurgePending(): boolean {
  try {
    return localStorage.getItem(PERSISTED_COLLECTION_PURGE_PENDING_KEY) !== null;
  } catch {
    return false;
  }
}

function setPurgePending(pending: boolean): void {
  try {
    if (pending) {
      localStorage.setItem(PERSISTED_COLLECTION_PURGE_PENDING_KEY, "1");
    } else {
      localStorage.removeItem(PERSISTED_COLLECTION_PURGE_PENDING_KEY);
    }
  } catch (err) {
    logger.error("Failed to record the pending purge:", err);
  }
}

/**
 * The owner transition currently touching the shared OPFS file.
 *
 * Auth setup and first sync live in different React components, so both may
 * ask about the same owner during one mount. They must share one operation:
 * two concurrent close/delete attempts can race each other, and first sync
 * must not continue while the auth-side purge is still in flight.
 */
let ownerTransitionTarget: string | null = null;
let ownerTransitionPromise: Promise<boolean> | null = null;
let ownerTransitionQueue: Promise<void> = Promise.resolve();

/**
 * Remove the OPFS file, reporting whether it is gone afterwards.
 *
 * Kept separate from closing the database because the open path calls this
 * while nothing is open — and resetting `openPromise` from inside the open
 * would null out the very promise being assigned.
 */
async function removeDatabaseFile(): Promise<boolean> {
  if (!supportsOpfsPersistence()) return true;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(DATABASE_NAME);
    return true;
  } catch (err) {
    // A file that was never written is already in the desired state.
    if ((err as { name?: string }).name === "NotFoundError") return true;
    // Anything else leaves the previous account's rows on disk, which is the
    // case this whole mechanism exists to prevent. Most likely another tab of
    // this origin still holds a sync access handle on the file.
    logger.error("Failed to delete the persisted collection database:", err);
    return false;
  }
}

/**
 * Close the database and delete its OPFS file, reporting whether it is gone.
 *
 * The file cannot be removed while the worker holds sync access handles on it,
 * so the close (which terminates the worker) has to come first.
 */
async function deletePersistedDatabase(): Promise<boolean> {
  try {
    await openedDatabase?.close?.();
  } catch (err) {
    logger.error("Failed to close the persisted collection database:", err);
  }
  openedDatabase = null;
  // Any adapter call after this point would hit a closed worker, so force the
  // next open to start over. Callers reload the page rather than continue.
  openPromise = null;

  return removeDatabaseFile();
}

/**
 * Discard persisted collections when they stop belonging to the current user.
 *
 * The store is one per-device store, so a device shared by two people would
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
 * Returns whether a purge was required. A purge closes the database, so the
 * caller must reload rather than keep using collections bound to it — that is
 * true whether or not the deletion itself succeeded.
 *
 * ## When the file cannot be deleted
 *
 * `removeEntry` fails if another tab of this origin still holds a sync access
 * handle on the store. Recording the new owner anyway would be the worst
 * possible outcome: the surviving database is reopened on the next load and
 * hydrated under the new owner. Worse, a failed *sign-out* purge would leave
 * the store labelled `anonymous`, and anonymous → user B is the one exempt
 * transition — so the previous user's rows would be handed to first sync as B's
 * local data and uploaded into B's account.
 *
 * So a failed deletion leaves the owner untouched (the transition is retried on
 * the next auth change) and sets a pending-purge flag. `openPersistence` retries
 * the deletion before opening and refuses to open at all while the flag is still
 * set, so the surviving rows are never read even if they cannot yet be removed.
 */
async function performOwnerTransition(owner: string): Promise<boolean> {
  const previous = readOwner();
  if (previous === owner) return false;

  const purge = previous !== null && previous !== ANONYMOUS_OWNER;
  if (purge) {
    // Set before attempting, so a crash or a closed tab mid-delete still leaves
    // the store marked as one that must not be hydrated.
    setPurgePending(true);
    if (!(await deletePersistedDatabase())) return true;
    setPurgePending(false);
  }
  writeOwner(owner);
  return purge;
}

export function purgePersistedDataOnOwnerChange(userId: string | null): Promise<boolean> {
  const owner = userId ?? ANONYMOUS_OWNER;
  if (ownerTransitionTarget === owner && ownerTransitionPromise) {
    return ownerTransitionPromise;
  }

  const transition = ownerTransitionQueue.then(() => performOwnerTransition(owner));
  ownerTransitionQueue = transition.then(
    () => undefined,
    () => undefined,
  );
  ownerTransitionTarget = owner;
  ownerTransitionPromise = transition;
  void transition.finally(() => {
    if (ownerTransitionPromise === transition) {
      ownerTransitionTarget = null;
      ownerTransitionPromise = null;
    }
  });
  return transition;
}

/** Reset module state. Intended for tests. */
export function resetPersistenceForTests(): void {
  openPromise = null;
  openedDatabase = null;
  ownerTransitionTarget = null;
  ownerTransitionPromise = null;
  ownerTransitionQueue = Promise.resolve();
  setPurgePending(false);
}
