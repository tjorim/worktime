package com.worktime.android.core.sync

import android.util.Log
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okio.BufferedSource

private const val EVENT_STREAM_CONTENT_TYPE = "text/event-stream"
private const val INITIAL_RETRY_MS = 1_000L
private const val MAX_RETRY_MS = 30_000L
private const val SYNC_CHANGED_EVENT = "sync_changed"
private const val TAG = "SseSyncSignalTransport"
private const val BACKOFF_MULTIPLIER = 2
private const val HTTP_UNAUTHORIZED = 401
private const val HTTP_FORBIDDEN = 403

private val json = Json { ignoreUnknownKeys = true }

@Serializable
private data class SyncChangedPayload(@SerialName("server_timestamp") val serverTimestamp: String? = null)

/** Whether the response status means "your token is bad" -- not worth retrying blindly. */
private fun isFatalAuthStatus(code: Int): Boolean = code == HTTP_UNAUTHORIZED || code == HTTP_FORBIDDEN

/**
 * OkHttp-based [SyncSignalTransport] that opens a streaming GET to `/api/sync/events` with a
 * bearer token -- native `EventSource`-equivalents on Android have no API for the custom
 * `Authorization` header the endpoint requires, same problem documented for the frontend's
 * `createFetchSseTransport` -- and reconnects with exponential backoff on drop.
 *
 * Mirrors `frontend/src/hooks/useSyncSignal.ts`'s `createFetchSseTransport`: a 401/403 is
 * treated as fatal for that token -- retrying immediately would just hammer the endpoint with a
 * token the server already rejected, so this stops the connect loop and instead calls
 * [onFatalAuthFailure] to force the app's session out of its authenticated state (matching how
 * every other 401 from this backend is handled -- see `WorktimeRepository`), which reconnects
 * this transport with a fresh token once the user signs back in. Every *re*connect (not the
 * first connection) also forces a catch-up refresh via [SyncSignalTransport.FORCE_REFRESH_SIGNAL],
 * since the server's per-connection event queue does not survive a dropped connection and there
 * is no real timestamp available to vouch for what, if anything, was missed.
 *
 * @param url Full URL of the SSE endpoint (e.g. `https://api.example/api/sync/events`).
 * @param client OkHttpClient to issue the streaming request on -- must not have a finite read
 *   timeout, since the connection is held open indefinitely between the server's keepalives.
 * @param tokenProvider Supplies a fresh bearer token for each (re)connect attempt; a null
 *   result stops the transport instead of connecting anonymously.
 * @param scope Coroutine scope the connect/read loop runs on; cancelled via the returned
 *   cleanup function rather than by the caller cancelling this scope directly.
 * @param onFatalAuthFailure Called when the endpoint itself rejects an ostensibly-fresh token
 *   with 401/403, so the caller can end the session rather than leave this transport silently
 *   dead for the rest of it. Defaults to a no-op for tests that don't care.
 * @param initialRetryMs Delay before the first reconnect attempt; doubles on each subsequent
 *   failure up to [maxRetryMs]. Overridable for tests; production call sites use the defaults.
 */
class SseSyncSignalTransport(
    private val url: String,
    private val client: OkHttpClient,
    private val tokenProvider: suspend () -> String?,
    private val scope: CoroutineScope,
    private val onFatalAuthFailure: suspend () -> Unit = {},
    private val initialRetryMs: Long = INITIAL_RETRY_MS,
    private val maxRetryMs: Long = MAX_RETRY_MS
) : SyncSignalTransport {
    override fun subscribe(onSignal: (String) -> Unit): () -> Unit {
        val stopped = AtomicBoolean(false)
        val currentCall = AtomicReference<Call?>(null)

        val job =
            scope.launch(Dispatchers.IO) {
                var retryMs = initialRetryMs
                var hasConnectedOnce = false
                while (isActive && !stopped.get()) {
                    val token = tokenProvider() ?: return@launch
                    try {
                        val call =
                            client.newCall(
                                Request
                                    .Builder()
                                    .url(url)
                                    .header("Authorization", "Bearer $token")
                                    .header("Accept", EVENT_STREAM_CONTENT_TYPE)
                                    .build()
                            )
                        currentCall.set(call)
                        call.execute().use { response ->
                            if (isFatalAuthStatus(response.code)) {
                                Log.w(TAG, "SSE authentication failed (${response.code}) -- ending the session")
                                onFatalAuthFailure()
                                return@launch
                            }
                            if (!response.isSuccessful) {
                                throw IOException("SSE connection failed: ${response.code}")
                            }
                            retryMs = INITIAL_RETRY_MS
                            if (hasConnectedOnce) {
                                onSignal(SyncSignalTransport.FORCE_REFRESH_SIGNAL)
                            }
                            hasConnectedOnce = true
                            readEvents(response.body.source(), onSignal)
                        }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: IOException) {
                        if (stopped.get()) return@launch
                        Log.d(TAG, "SSE connection error -- retrying", e)
                    }
                    if (stopped.get() || !isActive) return@launch
                    delay(retryMs)
                    retryMs = (retryMs * BACKOFF_MULTIPLIER).coerceAtMost(maxRetryMs)
                }
            }

        return {
            stopped.set(true)
            currentCall.get()?.cancel()
            job.cancel()
        }
    }

    /**
     * Reads `event:`/`data:` frames until the stream ends (server closed the connection, e.g. a
     * deploy) or is cancelled (the enclosing call is cancel()ed, which surfaces as an
     * [IOException] from the blocking read below and unwinds back into [subscribe]'s retry loop).
     * The backend only ever emits a single `data:` line per event (see AGENTS.md "Live
     * Updates"), so multi-line `data:` folding per the SSE spec is intentionally not implemented.
     */
    private fun readEvents(source: BufferedSource, onSignal: (String) -> Unit) {
        var eventName: String? = null
        var data: String? = null
        while (true) {
            val line = source.readUtf8Line() ?: break
            when {
                line.isEmpty() -> {
                    if (eventName == SYNC_CHANGED_EVENT) {
                        data?.let { dispatch(it, onSignal) }
                    }
                    eventName = null
                    data = null
                }
                line.startsWith(":") -> Unit // keepalive comment
                line.startsWith("event:") -> eventName = line.removePrefix("event:").trim()
                line.startsWith("data:") -> data = line.removePrefix("data:").trim()
            }
        }
    }

    private fun dispatch(data: String, onSignal: (String) -> Unit) {
        val payload =
            try {
                json.decodeFromString<SyncChangedPayload>(data)
            } catch (e: Exception) {
                Log.w(TAG, "Failed to parse SSE event data: $data", e)
                return
            }
        payload.serverTimestamp?.let(onSignal)
    }
}
