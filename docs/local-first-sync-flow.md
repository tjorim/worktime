# Local-First Usage, Account Connection, Backup, and Cross-Device Sync

**Status**: Accepted  
**Date**: 2026-04-03

---

## Summary

Worktime is a **local-first** application. All user data lives in the browser's
`localStorage` by default. Signing in enables optional cloud backup and
restore — it does **not** change where the primary copy lives. The app is
fully usable without an account and without any network access.

Sync capability is **bidirectional** (push + pull) but is **user-initiated**
on a per-session basis, not continuous or automatic. The system is therefore
best described as **backup-and-restore-capable with incremental sync**, rather
than a real-time multi-device sync product.

---

## States

| State | Auth | Data location | Description |
|-------|------|---------------|-------------|
| **Local-only** | None | localStorage | Default; no account required |
| **Signed in, no backup** | Yes | localStorage | User logged in but has never synced |
| **Backed up** | Yes | localStorage + server | Data has been pushed at least once |
| **Restored** | Yes | localStorage (from server) | Second device loaded data from server |

---

## User Flows

### 1. Local-Only Usage

1. User opens Worktime for the first time.
2. The Welcome Wizard runs (onboarding).
3. All data is written to `localStorage` under well-known keys
   (`worktime_user_state`, time-tracking keys, work-locations keys, etc.).
4. The user never sees an account prompt unless they visit the Settings page or
   a feature explicitly requires authentication.
5. Manual JSON backup (`Settings → Export`) is always available and works
   without an account.

**Invariant**: The app must be 100% functional in this state. No feature may
be gated behind sign-in unless the feature is inherently server-side (e.g.,
shared team calendars, cross-device access).

---

### 2. Signing In (No Prior Backup)

1. User signs in via the SuperTokens flow.
2. `AuthContext.isAuthenticated` becomes `true`; `userId` is set.
3. The frontend calls `GET /v1/db/sync/status` to check whether the server
   holds any data for this account.
4. **Server is empty** (`labels_updated_at`, `tasks_updated_at`, etc. are all
   `null`): no prompt is shown; local data is preserved as-is.
5. The sync badge/indicator shows "Not yet backed up".

At this point the user's data is still local-only. Nothing is sent to the
server automatically.

---

### 3. First-Time Backup (Existing Local Data)

1. User clicks "Back up now" (or the equivalent sync trigger in Settings).
2. The frontend reads all time-tracking data from `localStorage` and calls
   `POST /v1/db/sync/push` with the full local dataset.
3. Every record carries its `client_updated_at` timestamp.
4. The server stores all records. Because no server data exists yet for this
   account, there will be no conflicts.
5. The frontend stores the returned `server_timestamp` (or the current clock
   time) as the high-water mark for future incremental pulls.
6. The sync indicator updates to "Backed up" with the timestamp.

**Behavior when server already has data for this account** (rare but possible,
e.g., account was used on another device that has since been cleared):

- The frontend first calls `GET /v1/db/sync/pull?since=<epoch>` to retrieve
  all server records.
- If the pull response is non-empty the user is shown a **conflict prompt**
  (see §5 below) before any push occurs.

---

### 4. Restoring on a Second Device

1. User opens Worktime on a new device and signs in.
2. `localStorage` on the new device is empty (or contains only fresh
   onboarding defaults).
3. The frontend calls `GET /v1/db/sync/status`. One or more entity timestamps
   are non-null → server has data.
4. **Local `localStorage` is empty**: the frontend automatically starts a pull
   (`GET /v1/db/sync/pull?since=<epoch>`) and writes the result to
   `localStorage`. No prompt is required.
5. If the Welcome Wizard has not yet been dismissed on this device, it runs
   normally so the user can configure their roster and schedule. The restored
   time-tracking data (tasks, templates, labels, work locations) is available
   immediately; settings such as roster selection are re-entered through the
   wizard.
6. The frontend stores the `server_timestamp` from the pull response as its
   high-water mark.

**After restore**, the device operates as a normal local-first device. Future
edits stay local until the user manually syncs again.

---

### 5. Conflict Handling and Overwrite Choices

Conflicts arise when both local data and server data exist and at least one
record's `client_updated_at` is older than **or equal to** the server's
`updated_at` for the same record.

#### Backend conflict rule (existing behavior)

The sync service uses **last-write-wins** based on timestamps:

- A push record is accepted if `client_updated_at > server.updated_at`.
- A push record is rejected (`status: "conflict"`) if
  `client_updated_at ≤ server.updated_at`; the server value is returned in
  `server_updated_at`.

#### Frontend responsibility on conflict

When the frontend receives one or more `status: "conflict"` records in the
push response it **must not silently drop them**. The required behavior is:

1. Collect all conflicting record IDs and their server-side values (returned
   in the push response).
2. Display a summary to the user: "N records on the server are newer than your
   local copy."
3. Offer two options:
   - **Keep server version** — overwrite local records with the server values
     (client accepts server data).
   - **Keep my version** — re-push local records with an updated
     `client_updated_at` set to `now()` so they will win the timestamp check.
4. The user's choice is applied immediately; no partial state should persist.

#### Full-overwrite scenarios (two-device conflict at first backup)

When the user triggers a first-time backup on Device A after Device B has
already backed up data for the same account, the frontend must:

1. Pull all server records first (as described in §3).
2. Merge local records with server records in memory, comparing timestamps.
3. Present the conflict resolution prompt (above) for any overlapping records.
4. After the user resolves conflicts, push the merged dataset.

---

## Data Covered by Sync

The following localStorage keys/namespaces are in scope for sync:

| Data category | localStorage key / prefix | Backend entity |
|---------------|---------------------------|----------------|
| Time-tracking tasks | `TIME_TRACKING_STORAGE_KEYS.tasks` | `tasks` |
| Time-tracking templates | `TIME_TRACKING_STORAGE_KEYS.templates` | `templates` |
| Time-tracking labels | `TIME_TRACKING_STORAGE_KEYS.labels` | `labels` |
| Work locations | `worktime_work_locations_` (per-year prefix) | `work_locations` |

The following data is **not** synced and stays local-only:

| Data category | Reason |
|---------------|--------|
| `worktime_user_state` (roster, schedule, settings) | User-specific preferences; onboarding handles re-setup |
| Time-off (`.hday` text) | Managed via file import/export, not database rows |
| Gantt tasks | Not yet exposed in the sync API |
| Developer options | Device-specific, intentionally excluded |

---

## Implementation Guidance

### Frontend

1. **`useSyncStatus` hook** (to be created): wraps `GET /v1/db/sync/status` and
   exposes `{ hasServerData, lastSyncedAt, isSyncing }`. Call this once after
   sign-in and cache the result in React state.

2. **Sync trigger function**: a single `syncNow()` async function that
   orchestrates pull → conflict resolution prompt → push. Keep this outside
   React render so it can be called from Settings, a toolbar button, or after
   the Welcome Wizard.

3. **Conflict resolution UI**: a modal that lists conflicting record IDs (or
   summarizes by category) and offers the two choices. Reuse the existing
   `Modal` component from React-Bootstrap.

4. **High-water mark**: store the last successful `server_timestamp` in
   `localStorage` under a stable key (e.g., `worktime_sync_cursor`). Use this
   as the `since` parameter on all future pull calls to limit payload size.

5. **Welcome Wizard integration**: after a successful restore (Step §4), set
   `hasCompletedOnboarding: true` in `worktime_user_state` programmatically so
   the wizard does not re-run on subsequent visits.

### Backend

1. **Existing sync endpoints are sufficient** for the flows described above.
   No new endpoints are required to implement this document.

2. **`GET /v1/db/sync/status`** is the correct pre-flight check. Return `null`
   for all timestamps if the user has no records; return the latest
   `updated_at` per entity otherwise.

3. **Bulk initial push**: the existing `POST /v1/db/sync/push` endpoint accepts
   batches of any size. No special "initial backup" endpoint is needed; the
   client should simply include all records in a single request (or paginate if
   the payload would be very large).

4. **Conflict semantics**: the existing last-write-wins rule is correct and
   should not change. The frontend is responsible for surfacing conflicts to the
   user and deciding which version wins before re-pushing.

5. **Gantt tasks sync**: when Gantt tasks are added to the sync API, follow the
   same schema pattern as `tasks` (UUID primary key, `created_at`, `updated_at`,
   `deleted_at`, `user_id`).

---

## Open Questions

- Should "Keep my version" (client wins) be the default, or should the user
  always make an explicit choice? (Recommendation: explicit choice, no default.)
- Should the sync cursor survive a sign-out/sign-in cycle? (Recommendation:
  yes — store it keyed by `userId` so it survives account switches.)
- Should there be an automatic background sync interval for long-running
  sessions? (Out of scope for this document; keep manual-only for now.)
