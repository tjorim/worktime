package com.worktime.android.core.sync

/**
 * Transport-neutral interface for receiving `sync_changed` signals from the backend's
 * notify-then-pull SSE channel (`GET /api/sync/events` -- see AGENTS.md "Live Updates").
 * Mirrors the frontend's `SyncSignalTransport` (`frontend/src/hooks/useSyncSignal.ts`), so the
 * consumer (see [com.worktime.android.feature.dashboard.DashboardViewModel]) depends only on
 * this interface -- the concrete transport (SSE today) is an implementation detail.
 */
fun interface SyncSignalTransport {
    /**
     * Starts receiving sync signals, invoking [onSignal] with each event's ISO-8601
     * `server_timestamp`. Returns a cleanup function that stops the subscription; calling it
     * more than once must be safe.
     */
    fun subscribe(onSignal: (serverTimestamp: String) -> Unit): () -> Unit
}
