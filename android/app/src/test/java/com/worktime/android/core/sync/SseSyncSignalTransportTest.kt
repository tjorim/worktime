package com.worktime.android.core.sync

import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

private const val AWAIT_SECONDS = 5L

private fun sseEvent(eventName: String, serverTimestamp: String): String =
    "event: $eventName\ndata: {\"server_timestamp\":\"$serverTimestamp\"}\n\n"

class SseSyncSignalTransportTest {
    private lateinit var server: MockWebServer
    private lateinit var scope: CoroutineScope
    private val client = OkHttpClient()

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
        scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    }

    @After
    fun tearDown() {
        scope.cancel()
        server.close()
    }

    private fun transport(
        tokenProvider: suspend () -> String? = { "test-token" },
        onFatalAuthFailure: suspend () -> Unit = {},
        initialRetryMs: Long = 20,
        maxRetryMs: Long = 100
    ) = SseSyncSignalTransport(
        url = server.url("/api/sync/events").toString(),
        client = client,
        tokenProvider = tokenProvider,
        scope = scope,
        onFatalAuthFailure = onFatalAuthFailure,
        initialRetryMs = initialRetryMs,
        maxRetryMs = maxRetryMs
    )

    @Test
    fun invokesOnSignalForSyncChangedEvent() {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "text/event-stream")
                .body(sseEvent("sync_changed", "2026-08-29T10:00:00Z"))
                .build()
        )
        val signals = LinkedBlockingQueue<String>()

        val unsubscribe = transport().subscribe(signals::add)
        try {
            assertEquals("2026-08-29T10:00:00Z", signals.poll(AWAIT_SECONDS, TimeUnit.SECONDS))

            val request = server.takeRequest()
            assertEquals("Bearer test-token", request.headers["Authorization"])
            assertEquals("text/event-stream", request.headers["Accept"])
        } finally {
            unsubscribe()
        }
    }

    @Test
    fun ignoresKeepaliveCommentsAndOtherEventNames() {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "text/event-stream")
                .body(
                    ": keepalive\n\n" +
                        sseEvent("something_else", "2026-08-29T09:00:00Z") +
                        sseEvent("sync_changed", "2026-08-29T10:00:00Z")
                )
                .build()
        )
        val signals = LinkedBlockingQueue<String>()

        val unsubscribe = transport().subscribe(signals::add)
        try {
            assertEquals("2026-08-29T10:00:00Z", signals.poll(AWAIT_SECONDS, TimeUnit.SECONDS))
            assertNull(signals.poll(200, TimeUnit.MILLISECONDS))
        } finally {
            unsubscribe()
        }
    }

    @Test
    fun reconnectsAfterStreamEndsAndForcesACatchUpSignal() {
        // First connection closes with no events -- no synthetic signal on the very first
        // connect. The second (reconnect) forces a catch-up signal before reading any events.
        server.enqueue(MockResponse.Builder().addHeader("Content-Type", "text/event-stream").body("").build())
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "text/event-stream")
                .body(sseEvent("sync_changed", "2026-08-29T11:00:00Z"))
                .build()
        )
        val signals = LinkedBlockingQueue<String>()

        val unsubscribe = transport().subscribe(signals::add)
        try {
            assertEquals(SyncSignalTransport.FORCE_REFRESH_SIGNAL, signals.poll(AWAIT_SECONDS, TimeUnit.SECONDS))
            assertEquals("2026-08-29T11:00:00Z", signals.poll(AWAIT_SECONDS, TimeUnit.SECONDS))
            assertEquals(2, server.requestCount)
        } finally {
            unsubscribe()
        }
    }

    @Test
    fun stopsRetryingOnFatalAuthStatusAndCallsOnFatalAuthFailure() {
        server.enqueue(MockResponse.Builder().code(401).build())
        val signals = LinkedBlockingQueue<String>()
        val fatalAuthFailureCalls = LinkedBlockingQueue<Unit>()

        val unsubscribe =
            transport(onFatalAuthFailure = { fatalAuthFailureCalls.add(Unit) }).subscribe(signals::add)
        try {
            assertTrue(fatalAuthFailureCalls.poll(AWAIT_SECONDS, TimeUnit.SECONDS) != null)
            assertNull(signals.poll(300, TimeUnit.MILLISECONDS))
            // Give the (non-existent) retry loop a chance to fire if it incorrectly kept going.
            Thread.sleep(200)
            assertEquals(1, server.requestCount)
            assertEquals(0, fatalAuthFailureCalls.size) // called exactly once, not repeatedly
        } finally {
            unsubscribe()
        }
    }

    @Test
    fun stopsWithoutConnectingWhenTokenProviderReturnsNull() {
        val signals = LinkedBlockingQueue<String>()

        val unsubscribe = transport(tokenProvider = { null }).subscribe(signals::add)
        try {
            Thread.sleep(200)
            assertEquals(0, server.requestCount)
        } finally {
            unsubscribe()
        }
    }

    @Test
    fun unsubscribeStopsFurtherRequests() {
        server.enqueue(MockResponse.Builder().addHeader("Content-Type", "text/event-stream").body("").build())
        val signals = LinkedBlockingQueue<String>()
        // A generous retry delay so the reconnect attempt can't possibly fire before unsubscribe()
        // below runs -- this test is about the flag being honored, not a race with the timer.
        val unsubscribe = transport(initialRetryMs = 2_000).subscribe(signals::add)

        server.takeRequest(AWAIT_SECONDS, TimeUnit.SECONDS)
        unsubscribe()

        assertEquals(1, server.requestCount)
        Thread.sleep(300)
        assertEquals(1, server.requestCount)
    }
}
