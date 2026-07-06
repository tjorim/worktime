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
        server.close()
    }

    @Test
    fun getSyncStatusSendsAuthorizationHeaderAndParsesResponse() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body("""{"server_timestamp":"2026-05-26T12:00:00Z"}""")
                .build()
        )
        val api =
            WorktimeApi.create(
                baseUrl = server.url("/").toString(),
                enableNetworkLogging = false
            )

        val response = api.getSyncStatus(authorization = "Bearer token-123")

        val request = server.takeRequest()
        assertEquals("/api/sync/status", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals("Bearer token-123", request.headers["Authorization"])
        assertEquals("2026-05-26T12:00:00Z", response.serverTimestamp)
    }

    @Test
    fun getSyncStatusUsesRuntimeBaseUrlOverrideWhenProvided() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body("""{"server_timestamp":"2026-05-26T12:00:00Z"}""")
                .build()
        )
        val api =
            WorktimeApi.create(
                baseUrl = "http://build-default.invalid/",
                enableNetworkLogging = false,
                baseUrlOverrideProvider = { server.url("/").toString() }
            )

        val response = api.getSyncStatus(authorization = "Bearer token-123")

        val request = server.takeRequest()
        assertEquals("/api/sync/status", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals("2026-05-26T12:00:00Z", response.serverTimestamp)
    }

    @Test
    fun deleteAccountSendsAuthorizationHeaderAndDeleteMethod() = runTest {
        server.enqueue(MockResponse.Builder().code(204).build())
        val api =
            WorktimeApi.create(
                baseUrl = server.url("/").toString(),
                enableNetworkLogging = false
            )

        api.deleteAccount(authorization = "Bearer token-123")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/me", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals("Bearer token-123", request.headers["Authorization"])
    }
}
