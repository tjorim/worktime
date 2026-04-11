# Realtime Sync Architecture: Notify-Then-Pull, SSE Signaling, and Data Ownership

**Status**: Accepted  
**Date**: 2026-04-09  
**Relates to**: [#510](https://github.com/tjorim/worktime/issues/510) (umbrella), [#494](https://github.com/tjorim/worktime/issues/494) (prior context)

---

## Summary

This document locks in the architectural decisions for the next phase of
local-first sync: real-time freshness signaling. It defines the transport
model, the ownership boundary between TanStack Query and TanStack DB, and
the non-goals that must not creep into this phase.

The current-state baseline (local-first storage, offline outbox, cursor-based
REST sync, first-sync bootstrapping, and incremental pull) is captured in the
**Current State** table below. This document extends that baseline with the
realtime layer.

---

## Current State (Baseline)

The following mechanisms are already implemented and authoritative:

| Mechanism | Description |
|-----------|-------------|
| **Local-first storage** | Sync-managed domains are backed by TanStack DB QueryCollections; user settings remain in `localStorage`. The app is fully functional offline. |
| **Offline outbox queue** | Failed pushes are queued under `worktime_sync_outbox_<userId>` and flushed on reconnect. |
| **Cursor-based REST pull** | `GET /api/sync/pull?since=<ISO-8601>` returns records where `updated_at > since`, ordered by `updated_at`. |
| **Cursor-based REST push** | `POST /api/sync/push` accepts batches; last-write-wins via `client_updated_at`. |
| **First-sync bootstrapping** | On sign-in, Branches A–D handle the initial merge between local and server state (see §2 of the sync-flow doc). |
| **Incremental pull** | Successful immediate pushes refresh the sync cursor via `GET /api/sync/status`; incremental pulls with the stored `server_timestamp` cursor occur on reconnect/focus flushes and during conflict handling to pick up changes from other devices. |

The REST endpoints remain **authoritative** for all data transfer, recovery,
backfill, and conflict handling. The realtime layer described below is a
*freshness hint only*; it never transfers or validates data directly.

---

## Locked-In Decisions

### 1. Notify-Then-Pull Is the Realtime Model

When the server detects a change relevant to a signed-in user (e.g., a push
from another device), it sends a lightweight signal to connected clients.
Upon receiving the signal, the client triggers the incremental refresh flow:
`GET /api/sync/pull?since=<cursor>` for sync-owned records, plus any
additional per-domain fetches that remain outside `/api/sync/pull`.
Today that explicitly includes user preferences via `GET /api/preferences`,
because preferences are synced through a dedicated endpoint (as in
`useFirstSyncFlow`) and are not yet folded into `/api/sync/pull`.
Realtime signaling must therefore be treated as "notify, then run the full
refresh sequence required for consistency," not "notify, then call only
`/api/sync/pull`." If preferences are later incorporated into `/api/sync/pull`,
the extra fetch can be dropped and this document updated accordingly.

The signal carries **no data payload** — only a freshness hint (`"data
changed; pull now"`). This keeps the signaling layer thin, stateless, and
easy to reason about.

### 2. SSE Is the Default v1 Signaling Transport

Server-Sent Events (SSE) is the default transport for the first version of the
realtime layer. SSE is chosen because:

- It is unidirectional (server → client), which matches the notify-then-pull
  model exactly.
- It reuses standard HTTP/2 multiplexing with no upgrade handshake.
- It is trivially reconnectable; browsers retry automatically.
- It requires no additional infrastructure beyond the existing FastAPI backend.

The SSE endpoint will be added at `GET /api/sync/events` (authenticated, per-user
stream). Each event is delivered as a `text/event-stream` frame; the `data:`
field carries a serialized JSON object, e.g.:

```text
event: sync_changed
data: {"type":"sync_changed","server_timestamp":"<ISO-8601>"}
```

The client ignores the timestamp for data purposes and issues a pull using its
stored cursor. The timestamp may optionally be used to skip the pull when it
is not newer than the cursor.

### 3. The Signaling Layer Is a Freshness Hint Only

The SSE stream is **never authoritative** for:

- Delivering the actual changed records.
- Confirming that a push was received.
- Resolving conflicts.
- Determining the current state of any entity.

All of the above remain exclusively in the REST pull/push layer. If the SSE
stream is unavailable (network interruption, proxy stripping keep-alive headers,
user behind a firewall), the app degrades gracefully to polling-on-reconnect
with no data loss.

### 4. A Later Switch to WebSockets Remains Possible

The signaling abstraction (`useSyncSignal` or similar) accepts the transport as
a pluggable dependency. The rest of the sync pipeline (pull on signal, outbox
flush on reconnect) is transport-agnostic. Replacing SSE with WebSockets in a
future phase requires only:

1. A new transport adapter that emits the same `sync_changed` event.
2. Updating the backend to open a WebSocket endpoint alongside or instead of the
   SSE endpoint.
3. No changes to the pull/push pipeline, outbox, or conflict resolution logic.

This switch should only be considered when bidirectional communication or
server-push of non-sync data (e.g., notifications) is needed.

---

## Data Ownership Boundaries

### TanStack Query

**Standalone `useQuery` remains appropriate for:**

- Server-state that is **not** managed by the local-first sync pipeline: public
  holiday data (`useOpenHolidays`) and any other read-heavy remote data that
  does not need offline writes or cross-device merging.
- Ephemeral UI state derived from API calls that does not need to survive a
  page reload or be available offline.

**Standalone `useQuery` must not:**

- Act as a standalone cache for any sync-managed domain (tasks, templates,
  labels, work locations, user preferences, time-off entries, gantt tasks).
- Coexist alongside a QueryCollection for the same domain, since that creates
  two independent caches with diverging state.

### TanStack DB + QueryCollection

Sync-managed domains use `@tanstack/query-db-collection` (QueryCollection),
which bridges TanStack Query's fetch lifecycle into a TanStack DB collection.
TanStack Query and TanStack DB are **not competing stores** for these domains —
QueryCollection intentionally uses both:

- **`queryFn`** — wraps `GET /api/sync/pull?since=<cursor>` for incremental pull.
- **`onInsert` / `onUpdate` / `onDelete`** — call `POST /api/sync/push`;
  QueryCollection applies optimistic updates locally and rolls back on failure.
- **Direct writes** — called by the SSE signal handler (`useSyncSignal`) on a
  `sync_changed` event, writing straight to the collection without triggering a
  full refetch.

**TanStack DB (via QueryCollection) becomes authoritative when:**

- An entity domain is migrated into the local-first sync pipeline and
  fine-grained reactivity (row-level subscriptions via `useLiveQuery`) is
  required.

**TanStack DB must not:**

- Be introduced for domains that are purely server-side reads without offline
  write requirements — standalone `useQuery` is correct for those.

### The Signaling Layer

The signaling layer (SSE transport + `useSyncSignal` hook) **owns nothing**.
It is a trigger: on event received → call pull. It must not cache data, mutate
`localStorage`, or bypass the pull/push pipeline.

---

## Domain Ownership and Coexistence

The table below is the authoritative record of per-domain ownership. All
sync-managed domains are fully wired to a QueryCollection; only user
preferences remains in a `localStorage`-backed context pending a future
migration.

| Domain | localStorage key(s) | Owner | Status |
|--------|---------------------|-------|--------|
| Time-tracking labels | — (collection only) | TanStack DB (`labelsCollection`) | migrated |
| Time-tracking tasks | — (collection only) | TanStack DB (`tasksCollection`) | migrated |
| Time-tracking templates | — (collection only) | TanStack DB (`templatesCollection`) | migrated |
| Time-off entries | — (collection only) | TanStack DB (`timeOffCollection`) | migrated |
| Gantt tasks | — (collection only) | TanStack DB (`ganttTasksCollection`) | migrated |
| Work locations | — (collection only) | TanStack DB (`workLocationsCollection`) | migrated |
| User preferences | `worktime_user_state` (partial) | `SettingsContext` / sync pipeline | pending |
| Public holidays | OpenHolidays API | TanStack Query (`useOpenHolidays`) | stable |
| Team / roster data | Backend `.hday` API | Fetched directly (no persistent cache) | stable |

### Coexistence Rules

1. **One owner per domain, always.** A domain is owned by either a
   `localStorage`-backed hook (`pending`) or by a TanStack DB QueryCollection
   (`migrated`). It is never owned by both simultaneously.

2. **QueryCollection is the correct pattern for sync-managed domains, not
   standalone `useQuery`.** QueryCollection (TanStack DB collection backed by a
   TanStack Query `queryFn`) uses TanStack Query internally. Do not introduce a
   standalone `useQuery` call for a domain that already has a QueryCollection —
   that creates a competing cache.

3. **Legacy path is removed on migration.** When a domain transitions from
   `pending` to `migrated`, the corresponding legacy localStorage-backed hook
   and any associated storage key constants are removed in the same PR.

4. **Test isolation is guaranteed by the existing setup.** QueryCollection
   mutations are kept in memory during tests. Test isolation is preserved by the
   `localStorage.clear()` call already present in `tests/setup.ts`. No
   additional test setup is required.

5. **No React provider required.** TanStack DB collections are module-level
   singletons and do not require a React context provider. The existing
   `TestProviders` wrapper in `tests/utils/testProviders.tsx` is sufficient for
   component tests that consume migrated collections.

### QueryCollection Definitions

All sync-managed domains are defined in `frontend/src/db/collections.ts` using
`queryCollectionOptions` from `@tanstack/query-db-collection`. Each collection
is wired as follows:

- **`queryFn`** → `GET /api/sync/pull` — fetches the full current state for the
  domain on first mount (full pull; cursor-based incremental pull is handled by
  `applyIncrementalPullToCollections`).
- **`onInsert` / `onUpdate` / `onDelete`** → `POST /api/sync/push` — pushes
  local mutations to the server; QueryCollection applies optimistic updates
  locally and rolls back on failure.
- **Offline mutation queuing (Option A)** — on push failure, the payload is
  enqueued into the per-user outbox (`worktime_sync_outbox_<userId>`) and
  flushed on the next successful sync cycle, preserving existing offline
  guarantees.
- **SSE direct writes** — `applyIncrementalPullToCollections` uses the direct-
  write API (`utils.writeUpsert` / `utils.writeDelete`) to merge server changes
  without triggering new push operations.

To migrate the remaining `pending` domain (user preferences) in a future issue:

1. Add a `userPreferencesCollection` entry to `frontend/src/db/collections.ts`
   using `queryCollectionOptions`, wired to the preferences endpoint.
2. Replace `SettingsContext` reads/writes for the synced fields with
   `useLiveQuery` over the new collection.
3. Remove the legacy sync pipeline path for preferences.
4. Remove the `worktime_user_state` entry from the domain table and mark the
   domain as `migrated`.
5. Do **not** add a standalone `useQuery` call alongside the QueryCollection.

---

## Non-Goals

The following are **explicitly out of scope** for this phase:

- **No full mutation streaming over SSE or WebSockets.** Data is never
  transferred through the signaling channel; only the hint is.
- **No exactly-once, replay-capable, or resumable socket protocol.** SSE
  reconnects are handled by the browser; missed events cause a pull on
  reconnect, which is sufficient.
- **No requirement to remove TanStack Query** from domains that are not
  sync-managed. Existing `useQuery` usage for holidays and similar read-only
  remote data remains correct and should not be changed as part of this work.
- **No new conflict resolution strategy.** Last-write-wins via
  `client_updated_at` is correct and unchanged.
- **No WebSocket in v1.** SSE is sufficient for unidirectional freshness hints.

---

## Follow-Up Implementation Issues

The following issues track the concrete implementation work flowing from these
decisions:

- [#510](https://github.com/tjorim/worktime/issues/510) — Umbrella: local-first
  sync migration (covers all sync phases).
- [#494](https://github.com/tjorim/worktime/issues/494) — Prior context for the
  sync design decisions that this document formalizes.

New issues should be filed as children of #510 for:

1. `GET /api/sync/events` SSE endpoint (backend).
2. `useSyncSignal` hook and SSE transport adapter (frontend).
3. Wire `useSyncSignal` into the incremental pull trigger (frontend).
4. Degrade gracefully when SSE is unavailable (fall back to pull-on-reconnect).
5. Migrate user preferences to a QueryCollection (see §Domain Ownership Table).

**Code references for per-domain ownership:**

- QueryCollection definitions: `frontend/src/db/collections.ts`
- Approved standalone `useQuery` usage: `frontend/src/hooks/useOpenHolidays.ts`
- Storage key registry: `frontend/src/constants/storageKeys.ts`
