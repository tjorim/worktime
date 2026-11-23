package com.worktime.android.data.api

import com.worktime.android.data.model.LabelMutationRequest
import com.worktime.android.data.model.LabelPatchRequest
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TemplatePatchRequest
import com.worktime.android.data.model.TimeOffEntryPatchRequest
import com.worktime.android.data.model.UserPreferencesWrite
import com.worktime.android.data.model.WorkLocationMutationRequest
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
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
        assertEquals("/api/time-off", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals("Bearer token-123", request.headers["Authorization"])
        assertEquals(1, response.items.size)
        assertEquals("entry-1", response.items.first().entryId)
    }

    @Test
    fun listLabelsUsesCanonicalCollection() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body("""{"items":[],"total":0}""")
                .build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        api.listLabels(authorization = "Bearer token-123")

        val request = server.takeRequest()
        val path = request.requestLine.substringAfter(' ').substringBefore(' ')
        assertEquals("GET", request.method)
        assertEquals("/api/labels", path)
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
    fun createLabelSendsPayloadToCanonicalCollection() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .addHeader("Content-Type", "application/json")
                .body(
                    """{"id":"label-1","name":"Focus","color":"#2196F3","created_at":"2026-05-26T12:00:00Z",""" +
                        """"updated_at":"2026-05-26T12:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response =
            api.createLabel(
                authorization = "Bearer token-123",
                payload = LabelMutationRequest(name = "Focus", color = "#2196F3")
            )

        val request = server.takeRequest()
        val body = request.body?.utf8().orEmpty()
        assertEquals("POST", request.method)
        assertEquals(
            "/api/labels",
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
                    """{"id":"template-1","label_id":"label-1","text":"Standup",""" +
                        """"start_time":"09:00","stop_time":"09:15","created_at":"2026-05-26T12:00:00Z",""" +
                        """"updated_at":"2026-05-26T12:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response =
            api.updateTemplate(
                authorization = "Bearer token-123",
                templateId = "template-1",
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
        assertEquals("PATCH", request.method)
        assertEquals(
            "/api/time-tracking/templates/template-1",
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
    fun updateTaskSendsOnlyChangedFields() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .body(
                    """{"id":"task-1","label_id":"label-1","text":"Focus","start_time":"2026-05-26T12:00:00Z",""" +
                        """"stop_time":"2026-05-26T13:00:00Z","includes_break":false,""" +
                        """"created_at":"2026-05-26T12:00:00Z","updated_at":"2026-05-26T13:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val stopTime = "2026-05-26T13:00:00Z"
        val response = api.updateTask("Bearer token-123", "task-1", TaskMutationRequest(stopTime = stopTime))

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/time-tracking/tasks/task-1", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals(
            JsonObject(mapOf("stop_time" to JsonPrimitive(stopTime))),
            Json.parseToJsonElement(requireNotNull(request.body).utf8())
        )
        assertEquals(stopTime, response.stopTime)
    }

    @Test
    fun updateLabelUsesCanonicalPatchRoute() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .body(
                    """{"id":"label-1","name":"Focus","color":"#2196F3","created_at":"2026-05-26T12:00:00Z",""" +
                        """"updated_at":"2026-05-26T12:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response = api.updateLabel("Bearer token-123", "label-1", LabelPatchRequest(name = "Focus"))

        val request = server.takeRequest()
        assertEquals("PATCH", request.method)
        assertEquals("/api/labels/label-1", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals(
            JsonObject(mapOf("name" to JsonPrimitive("Focus"))),
            Json.parseToJsonElement(requireNotNull(request.body).utf8())
        )
        assertEquals("Focus", response.name)
    }

    @Test
    fun deleteLabelUsesCanonicalItemRoute() = runTest {
        server.enqueue(MockResponse.Builder().code(204).build())
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        api.deleteLabel("Bearer token-123", "label-1")

        val request = server.takeRequest()
        assertEquals("DELETE", request.method)
        assertEquals("/api/labels/label-1", request.requestLine.substringAfter(' ').substringBefore(' '))
    }

    @Test
    fun upsertWorkLocationSendsDateInPathOnly() = runTest {
        server.enqueue(
            MockResponse.Builder()
                .body(
                    """{"id":1,"date":"2026-05-26","country_code":"BE","label":null,""" +
                        """"created_at":"2026-05-26T12:00:00Z","updated_at":"2026-05-26T12:00:00Z"}"""
                ).build()
        )
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response = api.upsertWorkLocation("Bearer token-123", "2026-05-26", WorkLocationMutationRequest("BE"))

        val request = server.takeRequest()
        assertEquals("PUT", request.method)
        assertEquals("/api/work-locations/2026-05-26", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals(
            JsonObject(mapOf("country_code" to JsonPrimitive("BE"))),
            Json.parseToJsonElement(requireNotNull(request.body).utf8())
        )
        assertEquals("2026-05-26", response.date)
    }

    @Test
    fun getPreferencesRequestsMinimalResponseAndAcceptsEmptyBody() = runTest {
        server.enqueue(MockResponse.Builder().code(204).build())
        val api = WorktimeApi.create(baseUrl = server.url("/").toString(), enableNetworkLogging = false)

        val response = api.getPreferences("Bearer token-123")

        val request = server.takeRequest()
        assertEquals("GET", request.method)
        assertEquals("/api/preferences", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals("return=minimal", request.headers["Prefer"])
        assertEquals("Bearer token-123", request.headers["Authorization"])
        assertEquals(204, response.code())
        assertNull(response.body())
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
                    ),
                    clientUpdatedAt = "2026-11-23T12:00:00Z"
                )
            )

        val request = server.takeRequest()
        val body = request.body?.utf8().orEmpty()
        assertEquals("PUT", request.method)
        assertEquals("/api/preferences", request.requestLine.substringAfter(' ').substringBefore(' '))
        assertEquals(true, body.contains(""""work_location_home_country":"BE""""))
        assertEquals(true, body.contains(""""client_updated_at":"2026-11-23T12:00:00Z""""))
        assertEquals(JsonPrimitive("NL"), response.data["work_location_office_country"])
    }
}
