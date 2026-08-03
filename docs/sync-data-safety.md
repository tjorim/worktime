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

Two properties keep this from becoming its own problem:

- Only deletes that would hit an **active** row count. A re-flushed outbox is
  full of already-applied deletes; counting those would let a client deadlock
  against its own earlier success.
- The check runs **before** any record is mutated, so a refused batch leaves no
  partial state.

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
- **Local data is memory-only.** Nothing persists the sync-backed collections;
  a signed-out user's records do not survive a reload, and a signed-in user who
  opens the app offline sees an empty app until a pull succeeds.
- **Preferences are whole-blob last-write-wins.** Changing a setting on two
  devices means one device's entire settings document silently loses.
- **Database backups are not configured in this repo.** Production hosting lives
  in a separate infra stack; soft deletes only help if the database itself
  survives.
