# Sync data safety

How Worktime tries to make it safe to put a user's data in the cloud, what is
deliberately guarded against, and what is still open. Read alongside
`backend/app/services/sync_service.py` and `frontend/src/hooks/useFirstSyncFlow.ts`.

## Resolving a first-sync conflict

When both sides hold entities, the user picks one of three options
(`FirstSyncConflictDialog`, screenshot in `docs/screenshots/sync-conflict-dialogs.png`):

| Option | Effect | Destructive? |
|---|---|---|
| **Keep everything** (default) | Push local records as creates, delete nothing, pull the union back | No |
| Keep my local data | Local records as creates + a delete for every server-only record | Yes — server side |
| Use server data | Replace the local collections with the server's contents | Yes — local side |

`keep-both` is the default because it is the only option that cannot lose data.
Every entity is keyed by a client-generated id, so the union is unambiguous: a
duplicate is visible and removable, a deleted record is not recoverable. Two
edges worth knowing — work locations are keyed by `(user_id, date)`, so a
same-date collision resolves by last-write-wins on that one row, and two devices
holding a same-named label collide on `uq_active_label_user_name` and come back
as a per-record conflict. Neither destroys a record.

The dialog shows how many records each side holds, so the destructive options
are not chosen blind. The counts come from the Branch C pull, which happens
before the dialog is raised — every branch needs that data anyway, so it costs
no extra request and is reused by whichever option the user picks.

## The failure that matters most

Everything below exists to prevent one outcome: **a user signs in on a second
device and their account's history is replaced by that device's empty state.**

The first-sync flow asks the user to choose when both sides hold data. Choosing
"keep local data" builds a *replace* payload — local records as creates, plus a
`delete` for every server record with no local counterpart. That is correct when
the local side really is the user's data, and catastrophic when the local side is
merely *unloaded*. The two are indistinguishable from `collection.toArray` alone,
because the sync-backed collections are in-memory and start lazily.

Four independent things now have to fail before that outcome is possible.

### 1. Preferences no longer force the conflict branch

`syncStatusHasEntityData` decides "does the account have data", excluding
preferences. The settings blob (`worktime_user_state`) exists on every device
that has ever opened the app, so counting it as local data sent nearly every new
sign-in into the conflict dialog — which is exactly where "keep local data"
becomes reachable. Preferences are a single last-write-wins document that
`reconcilePreferences` settles by timestamp on both sides; they are never a
reason to ask the user to choose.

### 2. Local state is loaded before it is treated as truth

`readLocalSyncPayload` awaits `preloadSyncCollections()` before reading any
collection, and returns `null` if the load fails. Callers must treat `null` as
*"the local state is unknown"* and stop — never as *"there is no local data"*.

### 3. An empty local side is refused

`buildKeepLocalReplacePayload` throws `EmptyLocalReplaceError` when the local
payload holds nothing at all, because that can only produce a batch of deletes.

### 4. The server refuses to wipe an account without being told to

`push_changes` counts how many currently-active rows a batch would tombstone. At
`BULK_DELETE_MIN_RECORDS` (25) or more, *and* at `BULK_DELETE_FRACTION` (90%) or
more of everything the user still has, the push is refused with **409** unless
the request sets `allow_bulk_delete`. Only the user-confirmed replace sets it.

Three properties keep this from becoming its own problem:

- Only deletes that would hit an **active** row count. A re-flushed outbox is
  full of already-applied deletes; counting those would let a client deadlock
  against its own earlier success.
- The check runs **before** any record is mutated, so a refused batch leaves no
  partial state.
- A payload larger than `MAX_SYNC_PUSH_ITEMS` is split across requests, and each
  request is its own transaction. A per-request guard would see only its slice:
  1500 deletes chunked as 1000 + 500 passes the first (1000 of 1500 active is
  under the fraction) and refuses only the second, leaving the account
  two-thirds erased. No per-request rule catches that first chunk — on its own
  information it is an ordinary partial delete — so the client sets
  `declared_delete_total` and every chunk is judged against the logical push.
  It is advisory and can only tighten the guard; the client it protects against
  computes deletes for every server row, so it declares the real total and is
  refused on the first chunk.

## Supporting invariants

**A failed fetch must never look like empty data.** The collections' `queryFn`
throws on a non-ok pull instead of returning `[]`, so TanStack Query keeps the
last good data and retries. Returning `[]` made an expired token or a 502 during
a deploy indistinguishable from "this account has no records".

**A write is never dropped.** `enqueueChange` appends to the outbox *before*
checking whether the hook is still mounted — a push that fails while the tab is
closing used to be discarded with nothing left to retry it.
`appendToSyncOutbox` returns whether the write actually landed, so a storage
quota failure is reported rather than swallowed.

**A rejected batch never wedges the queue.** A permanent rejection (4xx other
than 401/403/408/429) moves the batch to `worktime_sync_quarantine_<userId>` and
clears it from the outbox. Retrying forever blocks every later change behind it;
dropping it loses data silently. Quarantining does neither.

## Local durability

The sync-backed collections are persisted with TanStack DB's
`persistedCollectionOptions` (`src/db/persistence.ts`), backed by WA-SQLite over
OPFS in a dedicated Web Worker, so the last known state survives a reload and an
offline launch of the installed PWA.

- Persistence sits *inside* the sync pipe: the wrapper intercepts the sync layer
  and writes rows as part of the sync commit, rather than mirroring the
  collection from the side. There is no write window in which a change is in the
  collection but not yet on disk.
- Hydration is ordered, not raced. The wrapper runs its persisted startup — and
  defers the collection's `markReady` — before it invokes the query collection's
  sync, so persisted rows are in place before a query result can commit over
  them. Every `queryFn` also awaits `whenPersistenceReady()`.
- When the server is unreachable on a cold start, `fetchWithLocalFallback`
  returns the collection's own (hydrated) rows rather than an empty app. It
  rethrows when the collection is empty, so an error keeps it empty and retrying
  instead of asserting the account is empty — an empty result would be
  replicated back to the server as a delete-everything.
- **Multi-tab writes are coordinated at the store.**
  `BrowserCollectionCoordinator` elects a leader over BroadcastChannel plus Web
  Locks, so exactly one tab owns the SQLite writer, the others route through it,
  and a committed write is broadcast to the other tabs. Signed in, this closes
  the two-tabs-editing gap: each tab's write round-trips through the server and
  every tab's pull asserts the same state. Signed out, it does **not** — see
  below.
- `schemaVersion` (`COLLECTION_SCHEMA_VERSION`) handles shape changes: a
  mismatch resets the store instead of migrating it, which is safe because every
  collection here is sync-present and the server re-supplies the rows.
- The store is deleted when it stops belonging to the current user — see the
  ownership table in `persistence.ts`. Signing in from anonymous is exempt: that
  data is the signing-in user's, and first sync uploads it. A purge closes the
  database, so it is followed by a reload; that is also what guarantees the
  previous account's rows do not survive in memory.
- Persistence degrades rather than breaking. Where OPFS, Web Workers or Web
  Locks are unavailable (older iOS Safari, private browsing, non-secure
  contexts, the test environment) the collections fall back to a no-op adapter
  and run from memory, exactly as they did before any persistence existed.

Local durability is a convenience, not the backup. The server is the backup;
OPFS storage can be cleared by the browser at any time.

### Known gap: two signed-out tabs writing in the same instant

Signed out, a row written in one tab can still be dropped if another tab writes
within roughly the same few hundred milliseconds. This is narrower than the
snapshot layer it replaced — which clobbered on any overlap inside its 500 ms
debounce, regardless of timing — but it is not closed.

The cause is not the coordinator, which serializes the SQLite writes correctly.
It is that **the query collection treats a `queryFn` result as the complete
state of the collection**. With no sync auth there is no server to pull from, so
the `queryFn` returns `collection.toArray` — this tab's memory — and that is
applied as a full replace, truncating anything another tab persisted since. Once
the coordinator's broadcast has reached the tab (measured at well under 300 ms
locally), its `toArray` already contains the other tab's row and the assertion
is harmless; the loss only happens inside that window.

Measured in Chromium, signed out, API unreachable:

| two tabs write | outcome |
|---|---|
| simultaneously | one row lost |
| 300 ms apart | both survive |
| 3000 ms apart | both survive |

Closing it properly means running the signed-out collections in
`persistedCollectionOptions`' local-only (`sync-absent`) mode, where the library
persists *pending mutations* and routes them through the leader rather than
re-deriving whole-collection state from a query. That is a different collection
configuration, chosen before auth is known at module load, so it is a separate
change — tracked in #1045, which records the prototype measurements.

Two things that look like fixes but are not. A union of memory and disk would
resurrect deleted rows, which currently delete correctly. And suppressing the
post-mutation refetch to stop the clobber would also stop rows persisting at
all: the same refetch does both jobs.

`sync-absent` mode is itself a trade rather than a clean win — it fixed the
concurrent-write loss in every prototype trial, but follower tabs then showed a
stale view until reloaded, matching open upstream issue TanStack/db#1486.

### The outbox is kept, not retired

TanStack's persisted **pending mutations** would in principle replace
`worktime_sync_outbox_<userId>`, but they are only wired up in
`persistedCollectionOptions`' local-only mode, which wraps `onInsert` /
`onUpdate` / `onDelete` to persist mutations. Every collection here is
sync-present, where the wrapper leaves those handlers alone and persists only
rows. So the outbox remains the mechanism that survives a failed push, and the
"Queued, not lost" guarantees above are unchanged.

### Bundle cost

Measured with `pnpm build` (production):

| | before | after | delta |
|---|---|---|---|
| **PWA precache** | 2610.54 KiB, 34 entries | 2681.35 KiB, 34 entries | **+70.81 KiB (+2.7%)** |
| `dist/` total | 2,702,952 B | 4,480,377 B | +1,777,425 B (+66%) |
| OPFS worker chunk | — | 1,698,339 B (705,058 B gzip) | runtime-cached, not precached |
| main-thread chunk (`useLocalStorage-*`) | 67.39 kB (18.79 kB gzip) | 139.55 kB (35.88 kB gzip) | +72.16 kB (+17.09 kB gzip) |

Almost all of the on-disk growth is the WA-SQLite WASM, inlined as base64 into
the OPFS worker chunk. Precaching it would have grown the install payload by 66%
for a file that only the persistence layer loads, so `workbox.globIgnores`
excludes it and a `CacheFirst` runtime rule caches it instead. Persistence
starts at app startup, which is necessarily online, so the worker is fetched and
cached on the first page load — well before any offline launch. Its filename is
content-hashed, so a new build fetches a new URL rather than serving a stale
worker.

Precache is the number that matters for install cost, and it grows by 2.7%.

### Eviction

OPFS is best-effort storage: the browser may clear it under storage pressure,
which for this app means an offline launch showing an empty screen — the exact
failure this layer exists to prevent. `requestPersistentStorage()` asks for an
exemption via `navigator.storage.persist()` at startup. Granting is at the
browser's discretion (Chrome decides from engagement signals, including whether
the PWA is installed; Firefox may prompt), so it is a request rather than a
guarantee, and it never blocks the database open.

## Recovery primitives

- **Deletes are soft.** Every sync delete sets `deleted_at`; nothing purges
  tombstones. Data removed through sync is still in Postgres.
- **Export.** `GET /api/users/{id}/export` returns the account's full contents as
  JSON. **Not currently reachable from the UI** — see below.
- **Quarantine.** Permanently-rejected batches are retained in localStorage
  (capped at 20 entries).

## Known gaps

These are real and not addressed here:

- **Account deletion is a hard delete.** `DELETE /api/me` removes every row
  immediately — no grace period, no tombstone, and the export endpoint is not
  offered first. Nothing short of a database backup recovers it.
- **No export in the UI.** The endpoint exists but nothing links to it, so users
  have no self-service copy of their data.
- **No restore path for soft-deleted records.** Recovering them means going into
  the database by hand.
- **No quarantine UI.** `quarantineCount` is exposed on the sync state and the
  batches are preserved, but nothing shows the user what was rejected or offers
  to retry it.
- **Conflict dialogs show counts, not contents.** Neither dialog shows the
  actual conflicting values, so "keep mine" and the two replace options are
  still judged on record counts alone.
- **No way to defer an ongoing conflict.** The dialog requires a choice; there
  is no "decide later" that leaves the conflict pending.
- **Preferences are whole-blob last-write-wins.** Changing a setting on two
  devices means one device's entire settings document silently loses.
- **Database backups are not configured in this repo.** Production hosting lives
  in a separate infra stack; soft deletes only help if the database itself
  survives.
