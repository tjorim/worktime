# Idempotency and retry contract

This document defines which Worktime writes may be retried after a timeout or
lost response. It is a behavioral contract: clients may rely on the guarantees
below, and new mutation endpoints must be added to the inventory before they
ship.

## Terms

- **Exact replay** means the same authenticated principal, logical identity,
  payload, and `client_updated_at` are delivered again.
- **Retry-safe** means repeating an operation cannot create another logical
  resource or repeat an external side effect. The HTTP status or response body
  need not be byte-for-byte identical.
- **LWW** means last-write-wins using `client_updated_at`. A timestamp equal to
  or older than the stored value is a conflict/no-op; a newer timestamp applies
  the supplied fields. Client timestamps are clamped to five minutes ahead of
  server time so a bad clock cannot freeze a row indefinitely.

## Sync push contract

`POST /api/sync/push` is transactional per request. A validation failure aborts
the entire request; ordinary per-record conflicts are returned in the results
and do not abort unrelated records. Clients keep an outbox item until they
receive a successful response, so response loss causes exact redelivery.
Established clients send their last pull cursor in `X-Sync-Cursor`. If that
cursor is older than the supported offline window, the server rejects the
entire push with `410 sync_cursor_expired` before applying any record. The
client full-resyncs and quarantines the stale batch instead of automatically
replaying changes that might resurrect a purged deletion.

| Entity | Stable logical identity | Create/update replay | Delete replay |
|---|---|---|---|
| Label | Client UUID (`id`) | Existing UUID enters LWW; never inserts a second row | Soft delete; missing/already deleted is an `ok` no-op |
| Time-tracking task | Client UUID (`id`) | Existing UUID enters LWW; single-running-task constraint may return conflict | Soft delete; missing/already deleted is an `ok` no-op |
| Time-tracking template | Client UUID (`id`) | Existing UUID enters LWW | Soft delete; missing/already deleted is an `ok` no-op |
| Gantt task | Client UUID (`id`) | Existing UUID enters LWW | Soft delete; unlinking active time entries happens only on the first delete |
| Time-off entry | `(user_id, client entry_id)` | Full creates upsert through LWW; a patch for a missing row conflicts | Soft delete; missing/already deleted is an `ok` no-op |
| Work location | `(user_id, date)` | Natural-key upsert through LWW | Soft delete; missing/already deleted is an `ok` no-op |
| Preferences | `user_id` | Whole-document LWW through `PUT /api/preferences` | No delete operation |

All reads and mutations are scoped to the authenticated user. UUIDs are global
database primary keys for labels, tasks, templates, and Gantt tasks; if a
submitted UUID belongs to another user, the server returns the same generic
conflict used for a stale write. It neither overwrites the row nor reveals its
owner. The per-user natural keys include `user_id` in their lookup and unique
constraint. Retry processing retains the authenticated principal for validation
and request attribution; sync batches deliberately do not create per-row audit
entries because one offline batch can contain hundreds of field merges.

Pull uses a 30-second cursor overlap. This closes the race in which a concurrent
push stamps a row before a pull chooses its cursor but commits after the pull's
query. The overlap can redeliver rows, which clients apply by the same stable
identity and LWW rules. SSE notifications are freshness hints only: duplicate
or coalesced notifications cause a pull and are not mutations themselves.

## REST mutation inventory

The strategy column is prescriptive for callers. **No automatic retry** means a
client must reconcile with a read or ask the user before trying again.

| Mutation family | Strategy after response loss |
|---|---|
| `POST /api/sync/push` | Retry exact batch; naturally idempotent as specified above |
| `PUT /api/preferences` | Retry exact payload; per-user LWW upsert |
| Time-off and work-location create/upsert | Retry only with the same client entry ID/date; natural-key upsert |
| Label, task, template, and Gantt create | No automatic retry: REST creates generate a new UUID and could duplicate |
| Label, task, template, Gantt, time-off, and work-location update | Retry same resource ID; assignment is naturally idempotent, with ownership checks |
| Label, task, template, Gantt, time-off, and work-location delete | Effect is idempotent, but some REST routes return not-found on repetition; treat not-found after a retry as reconciled |
| User registration | Reconcile by authenticated identity/username; uniqueness prevents a second account |
| Admin user create | No automatic retry; reconcile by username before retrying |
| User/admin update | Retry same target and payload; assignment is naturally idempotent and authorization is rechecked |
| Account or admin user delete | Destructive effect is idempotent; a repeated request may be unauthorized/not-found once the account is gone |
| Push subscription subscribe/unsubscribe | Subscribe upserts by `(user_id, endpoint)`; repeated unsubscribe may be not-found and is reconciled |
| Pebble clock-in | No automatic retry; reconcile current running task first, because creation uses a new task UUID |
| Pebble clock-out | Retry-safe assignment to the current running task; if none remains, reconcile as already stopped |
| Personal access-token create and Pebble-token create | No automatic retry: each call creates a new secret; list/revoke uncertain credentials before retrying |
| Personal access-token revoke | Effect is idempotent; repeated request may be not-found |
| Integration-client create | No automatic retry: creates a client and one-time secret; list/revoke before retrying |
| Integration-client secret rotation | No automatic retry: every call invalidates the previous secret and returns a new one only once |
| Integration-client revoke | Effect is idempotent; repeated request may be not-found |
| iCalendar feed create/rotate | No automatic retry: each call rotates the one-time feed token; fetch feed status before user-confirmed rotation |
| iCalendar feed revoke | Retry-safe removal; repeated revoke leaves the feed disabled |

REST CRUD mutations and MCP writes use the authenticated principal when writing
audit entries. Retrying never accepts a user ID from the mutation body as audit
attribution, and ownership checks run again on every attempt.

## MCP mutation inventory

MCP read tools are idempotent. Write tools are grouped below; clients must not
infer retry safety merely from a tool name.

| Tools | Strategy after response loss |
|---|---|
| `set_work_location` | Retry exact date/value; natural-key upsert |
| `create_time_off_event` | Retry only when the caller supplied the same `entry_id`; without one, reconcile before retrying |
| `update_label`, `update_time_tracking_task`, `update_time_off_event`, `update_gantt_task` | Retry same ID/payload; assignment with owner-scoped lookup |
| `stop_time_entry` | Reconcile if there is no running entry; the first successful call already stopped it |
| All `delete_*` tools | Deletion effect is idempotent; not-found on repetition means reconciled |
| `create_label`, `start_time_entry`, `create_time_tracking_task`, `create_gantt_task` | No automatic retry: server-generated identity can duplicate |
| `create_integration_client`, `rotate_integration_client` | No automatic retry: one-time credential side effect; list/revoke or rotate deliberately |
| `revoke_integration_client` | Idempotent effect; not-found on repetition means reconciled |

MCP tools resolve `context.user_id` from the authenticated token and do not
accept a target user ID. Their audit actor is derived from that same context,
including integration-client attribution when present.

## Concurrency and future replay storage

Database uniqueness constraints are the final arbiter for concurrent delivery:
stable identities cannot be inserted twice, active work locations are unique by
user/date, and time-off entries are unique by user/entry ID. LWW resolves stale
sequential deliveries. Domain constraints (for example one running task) return
a conflict rather than silently duplicating state. Transaction commit occurs
before the sync response and notification, so losing a response can only cause
redelivery, not a dropped committed change.

There is currently **no server-side replay cache**. Natural identities and
constraints cover sync writes, while operations that mint or rotate one-time
secrets explicitly forbid automatic retries. If a future operation cannot be
made naturally idempotent, its design must include an authenticated idempotency
key, owner and operation binding, a finite retention period, a uniqueness
constraint, and a scheduled VPS cleanup job with monitoring. Unbounded replay
rows or a cache without an operational cleanup plan are not acceptable.
