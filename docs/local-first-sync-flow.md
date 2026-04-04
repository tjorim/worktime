# Local-First Usage, Account Connection, Backup, and Cross-Device Sync

**Status**: Accepted  
**Date**: 2026-04-03

---

## Summary

Worktime is a **local-first** application. All user data lives in the browser's
`localStorage` by default and the app is fully usable without an account or
network access.

When a user signs in, Worktime becomes an **account-backed, cross-device sync**
product. Changes made on any signed-in device are pushed to the backend as part
of normal use so that another device with the same account can pick them up.
Local-first and offline remain first-class concerns: while offline, changes are
queued locally and flushed automatically when connectivity is restored.

The intended experience for a signed-in user is **one account across devices**,
not two local apps with an occasional manual copy step.

---

## States

| State | Auth | Data location | Sync behavior |
|-------|------|---------------|---------------|
| **Local-only** | None | localStorage only | No sync; manual JSON export available |
| **Signed in — first use** | Yes | localStorage only | Initial pull on sign-in; push all local data once confirmed |
| **Synced** | Yes | localStorage + server | Changes pushed automatically; periodic pull for remote changes |
| **Offline (signed in)** | Yes | localStorage (server stale) | Changes queued; flushed on reconnect |
| **Restored (new device)** | Yes | localStorage (from server) | Initial pull fills local store; then transitions to Synced |

---

## User Flows

### 1. Local-Only Usage

1. User opens Worktime for the first time.
2. The Welcome Wizard runs (onboarding).
3. All data is written to `localStorage` under well-known keys
   (`worktime_user_state`, time-tracking keys, work-location keys, etc.).
4. The user is never prompted to sign in unless they visit the Settings page or
   a feature explicitly requires authentication.
5. Manual JSON backup (`Settings → Export`) is always available without an account.

**Invariant**: The app must be 100% functional without sign-in. No feature may
be gated behind authentication unless the feature is inherently server-side
(e.g., cross-device access, shared team calendars).

---

### 2. Signing In

1. User signs in via the SuperTokens flow.
2. `AuthContext.isAuthenticated` becomes `true`; `userId` is set.
3. The frontend immediately calls `GET /db/sync/status` to determine whether
   the server holds any data for this account.

**Branch A — Server is empty** (first-ever sign-in for this account):

4. The frontend pushes all local data to `POST /db/sync/push`, establishing
   this device's current local state as the initial server copy. Because
   there is no server data yet, no conflicts can arise.
5. The frontend stores the returned `server_timestamp` as the sync cursor under
   `worktime_sync_cursor_<userId>` in `localStorage`.
6. The app transitions to the **Synced** state.

**Branch B — Server already has data** (account used on a previous device):

4. The frontend pulls all server records via `GET /db/sync/pull` (omit
   `since` for a full pull), or `GET /db/sync/pull?since=<ISO-8601 timestamp>`
   when a prior sync cursor exists.
5. If `localStorage` is empty (new device), the pulled data is written directly
   with no conflict prompt. The Welcome Wizard runs so the user can configure
   their roster and schedule (see §4).
6. If `localStorage` has existing data, local and server records are merged
   in memory by timestamp. Conflicting records are surfaced to the user (see §5).
7. After any conflicts are resolved, the frontend stores the `server_timestamp`
   and transitions to the **Synced** state.

---

### 3. Ongoing Sync (Signed-In Normal Use)

Once signed in, changes are persisted to the backend as part of normal usage:

- **On write**: whenever the user creates, updates, or deletes a syncable record
  (task, template, label, work location), the frontend pushes the change to
  `POST /db/sync/push` in the background. If the push fails (e.g., offline),
  the change is added to an **outbox queue** stored in `localStorage`.
- **On reconnect / app focus**: the frontend flushes any queued outbox items and
  then pulls incremental updates via
  `GET /db/sync/pull?since=<server_timestamp>` (the ISO-8601 `server_timestamp`
  returned by the last successful push or pull, stored as the sync cursor) to
  pick up changes from other devices.
- **Conflicts**: handled as described in §5. During ongoing sync, conflicts
  should be rare because the last-write-wins rule resolves most cases silently.
  The user is only prompted when a conflict cannot be resolved automatically
  (i.e., when the frontend detects that a local record and a pulled server
  record both changed since the last sync).

**Offline behavior**: all writes succeed locally. The outbox queue accumulates
changes. When the app comes back online (detected via the `online` browser
event or a failed fetch followed by a retry), the queue is flushed in order.
No user action is required.

---

### 4. Signing In on a New Device (Restore)

1. User opens Worktime on a new device and signs in.
2. `localStorage` is empty (no prior use on this device).
3. The frontend calls `GET /db/sync/status`. One or more entity timestamps
   are non-null → the account has server data.
4. The frontend automatically pulls all records via
   `GET /db/sync/pull` and writes them to `localStorage`.
   No user confirmation is needed.
5. The Welcome Wizard runs on first use of this browser. Because
   `worktime_user_state` is not yet synced (see Data Scope below, temporary
   limitation), the user re-configures their roster and schedule. All
   time-tracking data (tasks, templates, labels, work locations) is already
   present in `localStorage` from the pull.
6. The frontend stores the `server_timestamp` from the pull as the sync cursor
   and transitions to the **Synced** state. Future edits on this device follow
   the ongoing-sync flow (§3).

---

### 5. Conflict Handling

Conflicts arise when both a local record and the server record for the same ID
have been modified since the last sync, and the local version's
`client_updated_at` is **less than or equal to** the server's `updated_at`
(the backend's last-write-wins rule).

#### Backend conflict rule (existing behavior)

The sync service uses **last-write-wins** based on timestamps:

- A push record is **accepted** if `client_updated_at > server.updated_at`
  (client version is strictly newer).
- A push record is **rejected** (`status: "conflict"`) if
  `client_updated_at ≤ server.updated_at`; the response reports the conflict
  via `server_updated_at` and `conflict_reason`. The client must then issue a
  subsequent `GET /db/sync/pull` to fetch the server's current record value
  before deciding what to do.

#### Conflict handling during ongoing sync

In the ongoing-sync flow (§3), most rejections are **stale-update resolutions**,
not true conflicts:

- **Stale update (silent)**: the client pushes a record that another device
  already updated. Because the server record is simply newer, the push is
  rejected with a conflict status. The client issues a follow-up pull to fetch
  the server's current value, updates `localStorage` silently. No user prompt
  is shown.
- **Client write wins (silent)**: the client's record is newer than the
  server's. The push is accepted; `localStorage` already has the correct value.

A **true conflict** — requiring a user prompt — occurs only when **two devices
edited the same record while both were offline**, and neither version is
obviously the "latest." Specifically: the client attempts to push a record
whose `client_updated_at` is older than the server's `updated_at`, but the
client also has local edits made after its last-known sync cursor (meaning it
cannot simply accept the server value without losing work). In that case:

1. Collect all ambiguous records and their server-side values.
2. Display a summary: "N records were changed on another device at the same
   time. Which version should be kept?"
3. Offer two options:
   - **Keep server version** — overwrite local records with the server values.
   - **Keep my version** — re-push local records with `client_updated_at` set
     to `now()` so they win the timestamp check.
4. Apply the user's choice immediately; no partial state should persist.

#### Conflicts on first sync (two devices, same account)

When Device A signs in and the server already has data from Device B (Branch B
of §2):

1. Pull all server records first.
2. Merge with local records in memory, comparing `updated_at` timestamps.
3. Present the conflict resolution prompt for any overlapping records.
4. After the user resolves conflicts, push the merged result.

---

## Data Scope

### Currently synced

| Data category | localStorage key / prefix | Backend entity |
|---------------|---------------------------|----------------|
| Time-tracking tasks | `TIME_TRACKING_STORAGE_KEYS.tasks` | `tasks` |
| Time-tracking templates | `TIME_TRACKING_STORAGE_KEYS.templates` | `templates` |
| Time-tracking labels | `TIME_TRACKING_STORAGE_KEYS.labels` | `labels` |
| Work locations | `worktime_work_locations_` (per-year prefix) | `work_locations` |

### Not yet synced (temporary limitations)

The following data does not currently sync across devices. Each item is a
near-term gap, not a deliberate permanent exclusion.

| Data category | Gap description |
|---------------|-----------------|
| `worktime_user_state` (roster, schedule, settings) | No backend schema for user preferences yet; causes Welcome Wizard to re-run on new devices |
| Time-off (`.hday` text) | Backend stores `.hday` as a file, not as structured rows; needs schema work before sync |
| Gantt tasks | Exist in the database (`/db/gantt-tasks`) but are not exposed via the sync endpoints yet |

### Permanently local-only

| Data category | Reason |
|---------------|--------|
| Developer options | Device-specific debug flags; intentionally not portable |

---

## Implementation Guidance

### Frontend

1. **Sync on write**: whenever a syncable record is mutated in `localStorage`,
   immediately attempt `POST /db/sync/push` in the background. On success,
   update the sync cursor. On failure, append the change to an outbox queue
   stored at `worktime_sync_outbox_<userId>` in `localStorage`.

2. **Outbox flush**: listen for the `online` browser event and on each app
   focus/visibility change. Drain the outbox queue in order, retrying failed
   items with exponential back-off. After a successful flush, pull incremental
   changes via `GET /db/sync/pull?since=<server_timestamp>` (ISO-8601).

3. **`useSyncStatus` hook** (to be created): exposes
   `{ isSyncing, lastSyncedAt, outboxCount, hasConflicts }`. Drive the sync
   indicator in the UI from this hook.

4. **Conflict resolution UI**: a modal that summarizes conflicting records by
   category and offers the two choices. Reuse the existing `Modal` component
   from React-Bootstrap.

5. **Sync cursor**: store the last successful `server_timestamp` in
   `localStorage` under `worktime_sync_cursor_<userId>` so it is per-account
   and survives sign-out/sign-in cycles.

6. **New-device restore**: on sign-in, if `GET /db/sync/status` returns
   non-null timestamps and local syncable data is absent, pull automatically
   before rendering the main UI.

### Backend

1. **Existing sync endpoints are sufficient for the currently synced entities**
   (tasks, templates, labels, work locations). No new endpoints are required
   for those flows. Preferences and Gantt tasks still need additional server
   support (see items 3 and 4 below).
   - `GET /db/sync/status` — pre-flight check; all-null means no server data.
   - `POST /db/sync/push` — accepts batches of any size; use this for both
     initial upload and ongoing per-write pushes.
   - `GET /db/sync/pull?since=<ISO-8601 timestamp>` — incremental pull from cursor (omit `since` for a full pull).

2. **Conflict semantics**: the existing last-write-wins rule is correct and
   should not change. The frontend owns conflict surfacing and resolution.

3. **`worktime_user_state` sync** (near-term): add a `user_preferences` table
   (keyed by `user_id`) and a matching sync endpoint so roster and schedule
   settings are portable. Once live, the Welcome Wizard should skip
   configuration steps when preferences are restored from the server.

4. **Gantt tasks sync** (near-term): expose the existing `gantt-tasks` data
   through the sync endpoints. Follow the same schema pattern as `tasks`
   (UUID primary key, `created_at`, `updated_at`, `deleted_at`, `user_id`).

---

## Open Questions

- Should "Keep my version" (client wins) be the default in the conflict UI, or
  should the user always make an explicit choice? (Recommendation: explicit
  choice, no default.)
- Should silent last-write-wins resolution apply to all ongoing-sync conflicts,
  or only to non-overlapping device edits? (Recommendation: silent for
  non-overlapping; prompt only when both devices edited the same record offline
  simultaneously.)
