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

    @Test
    fun listTimeOffEntriesResolvesUserFromTokenOnlyWithoutUserIdParam() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body(
                    """{"items":[{"id":1,"entry_id":"entry-1","user_id":1,"entry_kind":"date",""" +
                        """"date":"2026-06-01","start_date":null,"end_date":null,"weekday":null,""" +
                        """"entry_type":"vacation","entry_flag":"full_day","note":null,""" +
                        """"created_at":"2026-05-26T12:00:00Z","updated_at":"2026-05-26T12:00:00Z"}],"total":1}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response = api.listTimeOffEntries(authorization = "Bearer token-123")

        val request = server.takeRequest()
        assertEquals("/api/time-off/", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals("Bearer token-123", request.headers["Authorization"])
        assertEquals(1, response.items.size)
        assertEquals("entry-1", response.items.first().entryId)
    }

    @Test
    fun listLabelsSendsUserIdQueryParam() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body("""{"items":[],"total":0}""")
                .build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        api.listLabels(authorization = "Bearer token-123", userId = 42)

        val request = server.takeRequest()
        val path = request.requestLine.substringAfter(' ').substringBefore(' ')
        assertEquals("/api/time-tracking/labels?user_id=42", path)
        assertEquals("Bearer token-123", request.headers["Authorization"])
    }

    @Test
    fun deleteTimeOffEntrySendsCorrectMethodAndPath() = runTest {
        server.enqueue(MockResponse.Builder().code(204).build())
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        api.deleteTimeOffEntry(authorization = "Bearer token-123", entryId = "entry-1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/time-off/entry-1", request.requestLine.substringAfter(' ').substringBefore(' '))
    }
}
