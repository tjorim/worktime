# Sync tombstone retention contract

Worktime supports incremental synchronization after a device has been offline
for **at most 90 days**. This is a conservative retention contract rather than
per-device acknowledgement: the service does not maintain a device registry.

Every sync-managed model with a `deleted_at` marker follows the same rule:
labels, time-tracking tasks, time-tracking templates, work locations, time-off
entries, and Gantt tasks remain available to incremental pulls for the entire
window. The cutoff is evaluated against server time and is strict: a tombstone
is purgeable only when `deleted_at < CURRENT_TIMESTAMP - INTERVAL '90 days'`.

## Returning after the window

`GET /api/sync/pull` returns HTTP 410 with the machine-readable code
`sync_cursor_expired` when a supplied cursor predates the window. The client
must then omit `since`, replace (not merge) all six local sync-managed
collections with that full response, and only then retry pending changes. This
replacement removes records whose tombstones have already been purged, so they
cannot be resurrected merely because the late device missed a deletion.

Backups contain active application data, not server tombstones or device sync
cursors. Restoring one remains an explicit user-confirmed replacement and is
therefore independent of tombstone retention. Account deletion continues to
delete the whole user's data through its existing transaction; the cleanup SQL
does not select by user and cannot affect active rows because every candidate
must have a non-null `deleted_at` older than the cutoff.

## Production cleanup

[`backend/sql/purge_sync_tombstones.sql`](../sql/purge_sync_tombstones.sql)
deletes at most 1,000 rows from each model per execution, in foreign-key-safe
order. Existing `deleted_at` indexes support the candidate scans. The final
result row reports a count for every model and must be captured by the scheduled
runner; a non-zero SQL exit must trigger its usual failure alert.

Do not schedule the query until deployed clients implement the HTTP 410 flow
above. The production schedule belongs in the separate `tjorim/apps` infra
repository, not this application repository. During rollout, run it repeatedly
until all counts are zero, then on the ordinary maintenance schedule.
