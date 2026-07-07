package com.worktime.android.data.api

import com.worktime.android.data.model.LabelMutationRequest
import com.worktime.android.data.model.TemplatePatchRequest
import com.worktime.android.data.model.TimeOffEntryPatchRequest
import com.worktime.android.data.model.UserPreferencesWrite
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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

    @Test
    fun createLabelSendsUserIdAndPayload() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body(
                    """{"id":"label-1","user_id":42,"name":"Focus","color":"#2196F3","created_at":"2026-05-26T12:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response =
            api.createLabel(
                authorization = "Bearer token-123",
                userId = 42,
                payload = LabelMutationRequest(name = "Focus", color = "#2196F3")
            )

        val request = server.takeRequest()
        val body = request.body?.utf8().orEmpty()
        assertEquals("POST", request.method)
        assertEquals(
            "/api/time-tracking/labels?user_id=42",
            request.requestLine.substringAfter(' ').substringBefore(' ')
        )
        assertEquals("Bearer token-123", request.headers["Authorization"])
        assertEquals(true, body.contains(""""name":"Focus""""))
        assertEquals(true, body.contains(""""color":"#2196F3""""))
        assertEquals("label-1", response.id)
    }

    @Test
    fun updateTemplateSendsPatchPayload() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body(
                    """{"id":"template-1","user_id":42,"label_id":"label-1","text":"Standup",""" +
                        """"start_time":"09:00","stop_time":"09:15","created_at":"2026-05-26T12:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response =
            api.updateTemplate(
                authorization = "Bearer token-123",
                templateId = "template-1",
                userId = 42,
                payload =
                TemplatePatchRequest(
                    text = "Standup",
                    labelId = "label-1",
                    startTime = "09:00",
                    stopTime = "09:15"
                )
            )

        val request = server.takeRequest()
        val body = request.body?.utf8().orEmpty()
        assertEquals("PUT", request.method)
        assertEquals(
            "/api/time-tracking/templates/template-1?user_id=42",
            request.requestLine.substringAfter(' ').substringBefore(' ')
        )
        assertEquals(true, body.contains(""""label_id":"label-1""""))
        assertEquals(true, body.contains(""""start_time":"09:00""""))
        assertEquals("template-1", response.id)
    }

    @Test
    fun updateTimeOffEntrySendsPatchWithoutUserIdAndPreservesExplicitNullNote() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body(
                    """{"id":1,"entry_id":"entry-1","user_id":42,"entry_kind":"range","date":null,""" +
                        """"start_date":"2026-06-01","end_date":"2026-06-03","weekday":null,""" +
                        """"entry_type":"vacation","entry_flag":"full_day","note":null,""" +
                        """"created_at":"2026-05-26T12:00:00Z","updated_at":"2026-05-26T12:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response =
            api.updateTimeOffEntry(
                authorization = "Bearer token-123",
                entryId = "entry-1",
                payload =
                TimeOffEntryPatchRequest(
                    entryKind = "range",
                    startDate = "2026-06-01",
                    endDate = "2026-06-03",
                    entryType = "vacation",
                    entryFlag = "full_day",
                    note = JsonNull
                )
            )

        val request = server.takeRequest()
        val path = request.requestLine.substringAfter(' ').substringBefore(' ')
        val body = request.body?.utf8().orEmpty()
        assertEquals("PATCH", request.method)
        assertEquals("/api/time-off/entry-1", path)
        assertEquals(false, path.contains("user_id"))
        assertEquals(true, body.contains(""""entry_kind":"range""""))
        assertEquals(true, body.contains(""""note":null"""))
        assertEquals("entry-1", response.entryId)
    }

    @Test
    fun putPreferencesSendsNestedDataPayload() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body("""{"data":{"work_location_home_country":"BE","work_location_office_country":"NL"}}""")
                .build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response =
            api.putPreferences(
                authorization = "Bearer token-123",
                payload =
                UserPreferencesWrite(
                    data =
                    JsonObject(
                        mapOf(
                            "work_location_home_country" to JsonPrimitive("BE"),
                            "work_location_office_country" to JsonPrimitive("NL")
                        )
                    )
                )
            )

        val request = server.takeRequest()
        val body = request.body?.utf8().orEmpty()
        assertEquals("PUT", request.method)
        assertEquals("/api/preferences", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals(true, body.contains(""""work_location_home_country":"BE""""))
        assertEquals(JsonPrimitive("NL"), response.data["work_location_office_country"])
    }
}
