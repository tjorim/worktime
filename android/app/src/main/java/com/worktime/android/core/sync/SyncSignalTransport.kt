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
     * `server_timestamp` -- or with [FORCE_REFRESH_SIGNAL] when the transport wants an
     * unconditional refresh regardless of any stored cursor (e.g. a reconnect catch-up, where
     * there's no real timestamp to vouch for what was missed). Returns a cleanup function that
     * stops the subscription; calling it more than once must be safe.
     */
    fun subscribe(onSignal: (serverTimestamp: String) -> Unit): () -> Unit

    companion object {
        /**
         * Sentinel passed to `onSignal` instead of a real `server_timestamp` to force an
         * unconditional refresh. Deliberately not a timestamp: an implementation's local clock
         * cannot be trusted to compare against a cursor recorded from the server's clock -- see
         * [SseSyncSignalTransport]'s reconnect catch-up. Consumers must bypass their normal
         * cursor/dedup comparison whenever they see this value.
         */
        const val FORCE_REFRESH_SIGNAL: String = ""
    }
}
