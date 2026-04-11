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
| **Local-first storage** | All user data lives in `localStorage`; the app is fully functional offline. |
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

## Rollout Coexistence During Migration Window

During the migration of sync-managed domains to TanStack DB (issue [#515](https://github.com/tjorim/worktime/issues/515)),
non-migrated and migrated domains must coexist safely. The rules below govern
that window.

### Domain Ownership Table

| Domain | localStorage key(s) | Current owner | Target owner | Status |
|--------|---------------------|---------------|--------------|--------|
| Time-tracking labels | `worktime_time_tracking_labels` | `EventStoreContext` | TanStack DB (`labelsCollection`) | pending |
| Time-tracking tasks | `worktime_time_tracking_tasks` | `EventStoreContext` | TanStack DB (`tasksCollection`) | pending |
| Time-tracking templates | `worktime_time_tracking_templates` | `EventStoreContext` | TanStack DB (`templatesCollection`) | pending |
| Time-off entries | `worktime_time_off_entries` | `EventStoreContext` | TanStack DB (`timeOffCollection`) | pending |
| Gantt tasks | `worktime_gantt_tasks` | `GanttContext` | TanStack DB (`ganttTasksCollection`) | pending |
| Work locations | `worktime_work_locations_<year>` | work-location hooks | TanStack DB (`workLocationsCollection`) | pending |
| User preferences | `worktime_user_state` (partial) | `SettingsContext` / sync pipeline | TanStack DB (future collection) | pending |
| Public holidays | OpenHolidays API | TanStack Query (`useOpenHolidays`) | TanStack Query (unchanged) | stable |
| Team / roster data | Backend `.hday` API | Fetched directly (no persistent cache) | No change planned | stable |

### Coexistence Rules

1. **One owner per domain, always.** During rollout, a domain is owned by
   either the existing `localStorage`-backed hooks (`pending`) or by a TanStack
   DB collection (`migrated`). It is never owned by both simultaneously.

2. **QueryCollection is the transition layer, not standalone `useQuery`.** When
   migrating a domain, wire it as a QueryCollection (TanStack DB collection
   backed by a TanStack Query `queryFn`). Do not introduce a standalone
   `useQuery` call as an intermediate step — that creates a competing cache.
   QueryCollection uses TanStack Query internally and is the correct pattern.

3. **All domains migrate together.** All pending domains in the table above are
   migrated in a single PR.

4. **Legacy path stays until fully removed.** A `pending` domain's existing
   hooks and localStorage writes remain unchanged. When a domain is marked
   `migrated`, the corresponding legacy hook is removed in the same PR — not
   after.

5. **Test isolation is guaranteed by the existing setup.** TanStack DB
   collections in this codebase use `localOnlyCollectionOptions` stubs during
   the pending phase, which are in-memory only. Once switched to
   `localStorageCollectionOptions`, test isolation is preserved by the
   `localStorage.clear()` call already present in `tests/setup.ts`. No
   additional test setup is required.

7. **No React provider required.** TanStack DB collections are module-level
   singletons and do not require a React context provider. The existing
   `TestProviders` wrapper in `tests/utils/testProviders.tsx` is sufficient for
   component tests that consume migrated collections.

### Collection Stubs

The placeholder collections for all sync-managed domains are defined in
`frontend/src/db/collections.ts`. Each currently uses `localOnlyCollectionOptions`
(an in-memory store with no side effects). These stubs are temporary scaffolding
only — they will be replaced by QueryCollections in
[#515](https://github.com/tjorim/worktime/issues/515).

When migrating a domain in [#515](https://github.com/tjorim/worktime/issues/515):

1. Install `@tanstack/query-db-collection`.
2. Replace `localOnlyCollectionOptions` with a `QueryCollection` wired to the
   pull/push endpoints:
   - `queryFn` → `GET /api/sync/pull?since=<cursor>`
   - `onInsert` / `onUpdate` / `onDelete` → `POST /api/sync/push`
3. Wire SSE direct writes: on `sync_changed` from `useSyncSignal`, call the
   collection's direct write API instead of triggering a full refetch.
4. Decide offline mutation queuing: QueryCollection rolls back failed mutations
   but does not persist them for retry. Either intercept failures and enqueue to
   the existing outbox, or accept re-entry on reconnect.
5. Replace usages of the legacy hook with `useLiveQuery` over the collection.
6. Remove the legacy hook.
7. Update the status column in this table from `pending` to `migrated`.
8. Do **not** add a standalone `useQuery` call for the same domain alongside
   the QueryCollection.

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
5. Activate per-domain TanStack DB collections by following the migration steps
   in **§Rollout Coexistence** above (tracked in [#515](https://github.com/tjorim/worktime/issues/515)).

**Code references for per-domain ownership:**

- Collection stubs (to be replaced by QueryCollections in #515): `frontend/src/db/collections.ts`
- Approved standalone `useQuery` usage: `frontend/src/hooks/useOpenHolidays.ts`
- Storage key registry: `frontend/src/constants/storageKeys.ts`
