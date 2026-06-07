package com.worktime.android.data.api

import kotlinx.coroutines.test.runTest
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class WorktimeApiTest {
    private lateinit var server: MockWebServer

    @Before
    fun setUp() {
        server = MockWebServer()
        server.start()
    }

    @After
    fun tearDown() {
        server.shutdown()
    }

    @Test
    fun getSyncStatusSendsAuthorizationHeaderAndParsesResponse() = runTest {
        server.enqueue(
            MockResponse()
                .setHeader("Content-Type", "application/json")
                .setBody("""{"server_timestamp":"2026-05-26T12:00:00Z"}""")
        )
        val api =
            WorktimeApi.create(
                baseUrl = server.url("/").toString(),
                enableNetworkLogging = false
            )

        val response = api.getSyncStatus(authorization = "Bearer token-123")

        val request = server.takeRequest()
        assertEquals("/api/sync/status", request.path)
        assertEquals("Bearer token-123", request.headers["Authorization"])
        assertEquals("2026-05-26T12:00:00Z", response.serverTimestamp)
    }
}
