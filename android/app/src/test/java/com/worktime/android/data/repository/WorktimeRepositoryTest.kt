package com.worktime.android.data.repository

import com.worktime.android.core.auth.SessionController
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FcmTokenRequest
import com.worktime.android.data.model.FcmTokenResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.LabelListResponse
import com.worktime.android.data.model.LabelMutationRequest
import com.worktime.android.data.model.LabelPatchRequest
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskListResponse
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TemplateListResponse
import com.worktime.android.data.model.TemplateMutationRequest
import com.worktime.android.data.model.TemplatePatchRequest
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.data.model.TimeOffEntryListResponse
import com.worktime.android.data.model.TimeOffEntryMutationRequest
import com.worktime.android.data.model.TimeOffEntryPatchRequest
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.UserPreferencesRead
import com.worktime.android.data.model.UserPreferencesWrite
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.model.WorkLocationListResponse
import com.worktime.android.data.model.WorkLocationMutationRequest
import com.worktime.android.data.model.WorkLocationRecord
import io.mockk.mockk
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class WorktimeRepositoryTest {
    @Test
    fun loadDashboardReturnsLoggedOutWhenNoTokenExists() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = null)
            )

        val result = repository.loadDashboard()

        assertEquals(DashboardLoadResult.LoggedOut, result)
    }

    @Test
    fun loadDashboardReturnsSuccessForHappyPath() = runTest {
        val dashboard = sampleDashboard()
        val repository =
            WorktimeRepository(
                api = FakeApi(response = dashboard),
                sessionController = FakeSessionController(token = "token-123")
            )

        val result = repository.loadDashboard()

        assertTrue(result is DashboardLoadResult.Success)
        assertEquals(dashboard, (result as DashboardLoadResult.Success).dashboard)
    }

    @Test
    fun loadDashboardMapsUnauthorizedToLoggedOut() = runTest {
        val sessionController = FakeSessionController(token = "expired-token")
        val repository =
            WorktimeRepository(
                api = FakeApi(dashboardThrowable = httpException(401)),
                sessionController = sessionController
            )

        val result = repository.loadDashboard()

        assertEquals(DashboardLoadResult.LoggedOut, result)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun loadDashboardCachesSuccessfulResponse() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache()
        val repository =
            WorktimeRepository(
                api = FakeApi(response = dashboard),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        repository.loadDashboard()

        assertEquals(dashboard, cache.savedDashboard)
        assertTrue(!cache.savedCachedAt.isNullOrBlank())
    }

    @Test
    fun loadDashboardClearsCacheOnUnauthorized() = runTest {
        val cache = FakeDashboardCache()
        cache.save(sampleDashboard(), "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(dashboardThrowable = httpException(401)),
                sessionController = FakeSessionController(token = "expired-token"),
                cache = cache
            )

        repository.loadDashboard()

        assertEquals(1, cache.clearCallCount)
        assertEquals(null, cache.load())
    }

    @Test
    fun loadCachedDashboardDelegatesToTheCache() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache()
        cache.save(dashboard, "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        val result = repository.loadCachedDashboard()

        assertEquals(CachedDashboard(dashboard, "2026-05-26T12:00:00Z"), result)
    }

    @Test
    fun loadCachedDashboardReturnsNullWithoutACache() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )

        assertEquals(null, repository.loadCachedDashboard())
    }

    @Test
    fun completeLogoutClearsCache() = runTest {
        val cache = FakeDashboardCache()
        cache.save(sampleDashboard(), "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        repository.completeLogout()

        assertEquals(1, cache.clearCallCount)
    }

    @Test
    fun deleteAccountClearsCacheOnSuccess() = runTest {
        val cache = FakeDashboardCache()
        cache.save(sampleDashboard(), "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        val result = repository.deleteAccount()

        assertTrue(result is MutationResult.Success)
        assertEquals(1, cache.clearCallCount)
    }

    @Test
    fun startTrackingReturnsValidationErrorForBadRequest() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(taskThrowable = httpException(400)),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.startTimeTracking("Focus")

        assertEquals(MutationResult.ValidationError("Request validation failed"), result)
    }

    @Test
    fun updateTaskReturnsLoggedOutOnUnauthorized() = runTest {
        val sessionController = FakeSessionController(token = "token-123")
        val repository =
            WorktimeRepository(
                api = FakeApi(taskThrowable = httpException(401)),
                sessionController = sessionController
            )
        repository.loadDashboard()

        val result = repository.updateTask("task-1", "Updated", null)

        assertEquals(MutationResult.LoggedOut, result)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun setWorkLocationReturnsSuccess() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result =
            repository.setWorkLocation(
                date = java.time.LocalDate.parse("2026-05-26"),
                countryCode = "de",
                label = "Office"
            )

        assertTrue(result is MutationResult.Success)
        assertEquals("DE", (result as MutationResult.Success).value.countryCode)
    }

    @Test
    fun deleteAccountReturnsLoggedOutWhenNoTokenExists() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = null)
            )

        val result = repository.deleteAccount()

        assertEquals(MutationResult.LoggedOut, result)
    }

    @Test
    fun deleteAccountLogsOutOnSuccess() = runTest {
        val sessionController = FakeSessionController(token = "token-123")
        val repository = WorktimeRepository(api = FakeApi(), sessionController = sessionController)
        repository.loadDashboard()

        val result = repository.deleteAccount()

        assertTrue(result is MutationResult.Success)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun deleteAccountLogsOutOnUnauthorized() = runTest {
        val sessionController = FakeSessionController(token = "token-123")
        val repository =
            WorktimeRepository(
                api = FakeApi(deleteAccountThrowable = httpException(401)),
                sessionController = sessionController
            )
        repository.loadDashboard()

        val result = repository.deleteAccount()

        assertEquals(MutationResult.LoggedOut, result)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun deleteAccountReturnsErrorAndDoesNotLogOutOnFailure() = runTest {
        val sessionController = FakeSessionController(token = "token-123")
        val repository =
            WorktimeRepository(
                api = FakeApi(deleteAccountThrowable = httpException(500)),
                sessionController = sessionController
            )
        repository.loadDashboard()

        val result = repository.deleteAccount()

        assertEquals(MutationResult.Error("Request failed (500)"), result)
        assertEquals(SessionState.Authenticated(hasRefreshToken = true), sessionController.sessionState.value)
    }

    @Test
    fun registerFcmTokenReturnsLoggedOutWhenNoTokenExists() = runTest {
        val repository = WorktimeRepository(api = FakeApi(), sessionController = FakeSessionController(token = null))

        val result = repository.registerFcmToken("device-token-1")

        assertEquals(MutationResult.LoggedOut, result)
    }

    @Test
    fun registerFcmTokenSendsTheTokenWithoutRequiringADashboardLoadFirst() = runTest {
        val api = FakeApi()
        val repository = WorktimeRepository(api = api, sessionController = FakeSessionController(token = "token-123"))

        val result = repository.registerFcmToken("device-token-1")

        assertTrue(result is MutationResult.Success)
        assertEquals("device-token-1", api.lastRegisteredFcmToken)
    }

    @Test
    fun registerFcmTokenReturnsErrorWhenUnconfiguredOnTheServer() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(fcmTokenThrowable = httpException(503)),
                sessionController = FakeSessionController(token = "token-123")
            )

        val result = repository.registerFcmToken("device-token-1")

        assertEquals(MutationResult.Error("Request failed (503)"), result)
    }

    @Test
    fun unregisterFcmTokenSendsTheToken() = runTest {
        val api = FakeApi()
        val repository = WorktimeRepository(api = api, sessionController = FakeSessionController(token = "token-123"))

        val result = repository.unregisterFcmToken("device-token-1")

        assertTrue(result is MutationResult.Success)
        assertEquals("device-token-1", api.lastUnregisteredFcmToken)
    }

    @Test
    fun buildLogoutIntentDelegatesToSessionControllerWithoutClearingState() = runTest {
        val intent = mockk<android.content.Intent>()
        val sessionController = FakeSessionController(token = "token-123", logoutIntent = intent)
        val repository = WorktimeRepository(api = FakeApi(), sessionController = sessionController)
        repository.loadDashboard()

        val result = repository.buildLogoutIntent()

        assertEquals(intent, result)
        // Building the intent must not itself end the local session — only completeLogout does.
        assertEquals(SessionState.Authenticated(hasRefreshToken = true), sessionController.sessionState.value)
        assertEquals(0, sessionController.completeLogoutCallCount)
    }

    @Test
    fun buildLogoutIntentReturnsNullWhenThereIsNothingToEndAtTheProvider() = runTest {
        val sessionController = FakeSessionController(token = "token-123", logoutIntent = null)
        val repository = WorktimeRepository(api = FakeApi(), sessionController = sessionController)
        repository.loadDashboard()

        assertEquals(null, repository.buildLogoutIntent())
    }

    @Test
    fun completeLogoutDelegatesToSessionController() = runTest {
        val sessionController = FakeSessionController(token = "token-123")
        val repository = WorktimeRepository(api = FakeApi(), sessionController = sessionController)
        repository.loadDashboard()

        repository.completeLogout()

        assertEquals(1, sessionController.completeLogoutCallCount)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun listTasksReturnsItems() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(taskListResponse = TaskListResponse(items = listOf(sampleTask(userId = 1)), total = 1)),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.listTasks()

        assertTrue(result is MutationResult.Success)
        assertEquals(1, (result as MutationResult.Success).value.size)
    }

    @Test
    fun deleteTaskReturnsSuccess() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.deleteTask("task-1")

        assertEquals(MutationResult.Success(Unit), result)
    }

    @Test
    fun getWorkLocationReturnsNullOnNotFound() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(workLocationNotFound = true),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.getWorkLocation(LocalDate.parse("2026-05-26"))

        assertEquals(MutationResult.Success(null), result)
    }

    @Test
    fun getWorkLocationReturnsSuccessWhenPresent() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.getWorkLocation(LocalDate.parse("2026-05-26"))

        assertTrue(result is MutationResult.Success)
        assertEquals("BE", (result as MutationResult.Success).value?.countryCode)
    }

    @Test
    fun deleteWorkLocationReturnsSuccess() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.deleteWorkLocation(LocalDate.parse("2026-05-26"))

        assertEquals(MutationResult.Success(Unit), result)
    }

    @Test
    fun loadWorkLocationPreferencesReadsBackendPreferencesBlob() = runTest {
        val repository =
            WorktimeRepository(
                api =
                FakeApi(
                    preferencesResponse =
                    UserPreferencesRead(
                        data =
                        JsonObject(
                            mapOf(
                                "settings" to
                                    JsonObject(
                                        mapOf(
                                            "homeCountry" to JsonPrimitive("be"),
                                            "officeCountry" to JsonPrimitive("nl")
                                        )
                                    )
                            )
                        )
                    )
                ),
                sessionController = FakeSessionController(token = "token-123")
            )

        val result = repository.loadWorkLocationPreferences()

        assertEquals(MutationResult.Success(WorkLocationPreferences(homeCountry = "BE", officeCountry = "NL")), result)
    }

    @Test
    fun updateWorkLocationPreferencesPreservesExistingPreferencesBlob() = runTest {
        val api =
            FakeApi(
                preferencesResponse =
                UserPreferencesRead(
                    data =
                    JsonObject(
                        mapOf(
                            "activeTab" to JsonPrimitive("today"),
                            "settings" to
                                JsonObject(
                                    mapOf(
                                        "theme" to JsonPrimitive("dark"),
                                        "homeCountry" to JsonPrimitive("BE")
                                    )
                                )
                        )
                    )
                )
            )
        val repository = WorktimeRepository(api = api, sessionController = FakeSessionController(token = "token-123"))

        val result = repository.updateWorkLocationPreferences(homeCountry = "de", officeCountry = "nl")

        assertEquals(MutationResult.Success(WorkLocationPreferences(homeCountry = "DE", officeCountry = "NL")), result)
        val data = requireNotNull(api.lastPreferencesWritePayload).data
        assertEquals("today", data["activeTab"]?.jsonPrimitive?.content)
        val settings = data["settings"]?.jsonObject
        assertEquals("dark", settings?.get("theme")?.jsonPrimitive?.content)
        assertEquals("DE", settings?.get("homeCountry")?.jsonPrimitive?.content)
        assertEquals("NL", settings?.get("officeCountry")?.jsonPrimitive?.content)
    }

    @Test
    fun createLabelReturnsValidationErrorOnConflict() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(labelThrowable = httpException(409)),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.createLabel("Focus", "#FF0000")

        assertEquals(MutationResult.ValidationError("Label name must be unique"), result)
    }

    @Test
    fun listLabelsReturnsItems() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(labelListResponse = LabelListResponse(items = listOf(sampleLabel()), total = 1)),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.listLabels()

        assertTrue(result is MutationResult.Success)
        assertEquals(1, (result as MutationResult.Success).value.size)
    }

    @Test
    fun updateLabelReturnsSuccess() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.updateLabel("label-1", name = "Renamed")

        assertTrue(result is MutationResult.Success)
    }

    @Test
    fun deleteLabelReturnsValidationErrorWhenInUse() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(labelThrowable = httpException(409)),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.deleteLabel("label-1")

        assertEquals(
            MutationResult.ValidationError("Label is in use by tasks or templates and cannot be deleted"),
            result
        )
    }

    @Test
    fun createTemplateReturnsSuccess() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result =
            repository.createTemplate(
                text = "Deep work",
                labelId = null,
                startTime = LocalTime.parse("09:00:00"),
                stopTime = LocalTime.parse("11:00:00")
            )

        assertTrue(result is MutationResult.Success)
    }

    @Test
    fun listTemplatesReturnsItems() = runTest {
        val repository =
            WorktimeRepository(
                api =
                FakeApi(templateListResponse = TemplateListResponse(items = listOf(sampleTemplate()), total = 1)),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.listTemplates()

        assertTrue(result is MutationResult.Success)
        assertEquals(1, (result as MutationResult.Success).value.size)
    }

    @Test
    fun deleteTemplateReturnsSuccess() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )
        repository.loadDashboard()

        val result = repository.deleteTemplate("template-1")

        assertEquals(MutationResult.Success(Unit), result)
    }

    @Test
    fun createTimeOffEntryReturnsLoggedOutWhenNoToken() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = null)
            )

        val result =
            repository.createTimeOffEntry(
                TimeOffDraft.SingleDate(
                    date = LocalDate.parse("2026-06-01"),
                    entryType = "vacation",
                    entryFlag = "full_day"
                )
            )

        assertEquals(MutationResult.LoggedOut, result)
    }

    @Test
    fun createTimeOffEntryDoesNotRequireDashboardLoad() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )

        val result =
            repository.createTimeOffEntry(
                TimeOffDraft.DateRange(
                    startDate = LocalDate.parse("2026-06-01"),
                    endDate = LocalDate.parse("2026-06-05"),
                    entryType = "vacation",
                    entryFlag = "full_day"
                )
            )

        assertTrue(result is MutationResult.Success)
        assertEquals("range", (result as MutationResult.Success).value.entryKind)
    }

    @Test
    fun createTimeOffEntryReturnsValidationErrorForBadRequest() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(timeOffThrowable = httpException(400)),
                sessionController = FakeSessionController(token = "token-123")
            )

        val result =
            repository.createTimeOffEntry(
                TimeOffDraft.Weekly(weekday = 1, entryType = "vacation", entryFlag = "full_day")
            )

        assertEquals(MutationResult.ValidationError("Request validation failed"), result)
    }

    @Test
    fun listTimeOffEntriesReturnsItems() = runTest {
        val repository =
            WorktimeRepository(
                api =
                FakeApi(
                    timeOffListResponse = TimeOffEntryListResponse(items = listOf(sampleTimeOffEntry()), total = 1)
                ),
                sessionController = FakeSessionController(token = "token-123")
            )

        val result = repository.listTimeOffEntries()

        assertTrue(result is MutationResult.Success)
        assertEquals(1, (result as MutationResult.Success).value.size)
    }

    @Test
    fun updateTimeOffEntryReturnsSuccess() = runTest {
        val api = FakeApi()
        val repository =
            WorktimeRepository(
                api = api,
                sessionController = FakeSessionController(token = "token-123")
            )

        val result =
            repository.updateTimeOffEntry(
                "entry-1",
                TimeOffDraft.SingleDate(
                    date = LocalDate.parse("2026-06-02"),
                    entryType = "sick",
                    entryFlag = "full_day"
                )
            )

        assertTrue(result is MutationResult.Success)
    }

    @Test
    fun updateTimeOffEntrySendsExplicitNullWhenNoteIsCleared() = runTest {
        val api = FakeApi()
        val repository =
            WorktimeRepository(
                api = api,
                sessionController = FakeSessionController(token = "token-123")
            )

        repository.updateTimeOffEntry(
            "entry-1",
            TimeOffDraft.SingleDate(
                date = LocalDate.parse("2026-06-02"),
                entryType = "sick",
                entryFlag = "full_day",
                note = null
            )
        )

        val payload = requireNotNull(api.lastTimeOffPatchPayload)
        assertEquals(JsonNull, payload.note)
        assertTrue(patchJson.encodeToString(payload).contains("\"note\":null"))
    }

    @Test
    fun deleteTimeOffEntryReturnsSuccess() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )

        val result = repository.deleteTimeOffEntry("entry-1")

        assertEquals(MutationResult.Success(Unit), result)
    }

    @Test
    fun deleteTimeOffEntryReturnsLoggedOutOnUnauthorized() = runTest {
        val sessionController = FakeSessionController(token = "token-123")
        val repository =
            WorktimeRepository(
                api = FakeApi(timeOffThrowable = httpException(401)),
                sessionController = sessionController
            )

        val result = repository.deleteTimeOffEntry("entry-1")

        assertEquals(MutationResult.LoggedOut, result)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    private class FakeApi(
        private val response: DashboardResponse = sampleDashboard(),
        private val dashboardThrowable: Throwable? = null,
        private val taskThrowable: Throwable? = null,
        private val taskListResponse: TaskListResponse = TaskListResponse(items = emptyList(), total = 0),
        private val workLocationThrowable: Throwable? = null,
        private val workLocationNotFound: Boolean = false,
        private val labelThrowable: Throwable? = null,
        private val labelListResponse: LabelListResponse = LabelListResponse(items = emptyList(), total = 0),
        private val templateThrowable: Throwable? = null,
        private val templateListResponse: TemplateListResponse = TemplateListResponse(items = emptyList(), total = 0),
        private val timeOffThrowable: Throwable? = null,
        private val timeOffListResponse: TimeOffEntryListResponse =
            TimeOffEntryListResponse(items = emptyList(), total = 0),
        private val deleteAccountThrowable: Throwable? = null,
        private val preferencesResponse: UserPreferencesRead? = null,
        private val fcmTokenThrowable: Throwable? = null
    ) : WorktimeApi {
        var lastTimeOffPatchPayload: TimeOffEntryPatchRequest? = null
            private set
        var lastPreferencesWritePayload: UserPreferencesWrite? = null
            private set
        var lastRegisteredFcmToken: String? = null
            private set
        var lastUnregisteredFcmToken: String? = null
            private set

        override suspend fun getDashboard(authorization: String, timezone: String): DashboardResponse {
            dashboardThrowable?.let { throw it }
            return response
        }

        override suspend fun createTask(authorization: String, userId: Int, payload: TaskMutationRequest): TaskRecord {
            taskThrowable?.let { throw it }
            return sampleTask(userId = userId, text = payload.text ?: "Task")
        }

        override suspend fun updateTask(
            authorization: String,
            taskId: String,
            userId: Int,
            payload: TaskMutationRequest
        ): TaskRecord {
            taskThrowable?.let { throw it }
            return sampleTask(userId = userId, id = taskId, text = payload.text ?: "Task")
        }

        override suspend fun getRunningTask(authorization: String, userId: Int): Response<TaskRecord> =
            Response.success(sampleTask(userId = userId))

        override suspend fun listTasks(
            authorization: String,
            userId: Int,
            startDate: String?,
            endDate: String?
        ): TaskListResponse {
            taskThrowable?.let { throw it }
            return taskListResponse
        }

        override suspend fun deleteTask(authorization: String, taskId: String, userId: Int) {
            taskThrowable?.let { throw it }
        }

        override suspend fun upsertWorkLocation(
            authorization: String,
            userId: Int,
            payload: WorkLocationMutationRequest
        ): WorkLocationRecord = WorkLocationRecord(
            id = 1,
            userId = userId,
            date = payload.date,
            countryCode = payload.countryCode.uppercase(),
            label = payload.label,
            createdAt = "2026-05-26T12:00:00Z"
        )

        override suspend fun listWorkLocations(
            authorization: String,
            userId: Int,
            startDate: String?,
            endDate: String?
        ): WorkLocationListResponse = WorkLocationListResponse(
            items = emptyList(),
            total = 0
        )

        override suspend fun getWorkLocation(
            authorization: String,
            valueDate: String,
            userId: Int
        ): Response<WorkLocationRecord> {
            workLocationThrowable?.let { throw it }
            if (workLocationNotFound) {
                return Response.error(404, "".toResponseBody("text/plain".toMediaType()))
            }
            return Response.success(
                WorkLocationRecord(
                    id = 1,
                    userId = userId,
                    date = valueDate,
                    countryCode = "BE",
                    label = null,
                    createdAt = "2026-05-26T12:00:00Z"
                )
            )
        }

        override suspend fun deleteWorkLocation(authorization: String, valueDate: String, userId: Int) {
            workLocationThrowable?.let { throw it }
        }

        override suspend fun createLabel(
            authorization: String,
            userId: Int,
            payload: LabelMutationRequest
        ): LabelRecord {
            labelThrowable?.let { throw it }
            return sampleLabel(name = payload.name, color = payload.color)
        }

        override suspend fun listLabels(authorization: String, userId: Int): LabelListResponse {
            labelThrowable?.let { throw it }
            return labelListResponse
        }

        override suspend fun updateLabel(
            authorization: String,
            labelId: String,
            userId: Int,
            payload: LabelPatchRequest
        ): LabelRecord {
            labelThrowable?.let { throw it }
            return sampleLabel(id = labelId, name = payload.name ?: "Label")
        }

        override suspend fun deleteLabel(authorization: String, labelId: String, userId: Int) {
            labelThrowable?.let { throw it }
        }

        override suspend fun createTemplate(
            authorization: String,
            userId: Int,
            payload: TemplateMutationRequest
        ): TemplateRecord {
            templateThrowable?.let { throw it }
            return sampleTemplate(text = payload.text)
        }

        override suspend fun listTemplates(authorization: String, userId: Int): TemplateListResponse {
            templateThrowable?.let { throw it }
            return templateListResponse
        }

        override suspend fun updateTemplate(
            authorization: String,
            templateId: String,
            userId: Int,
            payload: TemplatePatchRequest
        ): TemplateRecord {
            templateThrowable?.let { throw it }
            return sampleTemplate(id = templateId, text = payload.text ?: "Template")
        }

        override suspend fun deleteTemplate(authorization: String, templateId: String, userId: Int) {
            templateThrowable?.let { throw it }
        }

        override suspend fun upsertTimeOffEntry(
            authorization: String,
            payload: TimeOffEntryMutationRequest
        ): Response<TimeOffEntryRecord> {
            timeOffThrowable?.let { throw it }
            return Response.success(sampleTimeOffEntry(entryKind = payload.entryKind, entryType = payload.entryType))
        }

        override suspend fun listTimeOffEntries(
            authorization: String,
            startDate: String?,
            endDate: String?
        ): TimeOffEntryListResponse {
            timeOffThrowable?.let { throw it }
            return timeOffListResponse
        }

        override suspend fun getTimeOffEntry(authorization: String, entryId: String): TimeOffEntryRecord {
            timeOffThrowable?.let { throw it }
            return sampleTimeOffEntry(entryId = entryId)
        }

        override suspend fun updateTimeOffEntry(
            authorization: String,
            entryId: String,
            payload: TimeOffEntryPatchRequest
        ): TimeOffEntryRecord {
            timeOffThrowable?.let { throw it }
            lastTimeOffPatchPayload = payload
            return sampleTimeOffEntry(entryId = entryId, entryType = payload.entryType ?: "vacation")
        }

        override suspend fun deleteTimeOffEntry(authorization: String, entryId: String) {
            timeOffThrowable?.let { throw it }
        }

        override suspend fun getSyncStatus(authorization: String): SyncStatusResponse = SyncStatusResponse(
            serverTimestamp = "2026-05-26T12:00:00Z"
        )

        override suspend fun getPreferences(authorization: String): UserPreferencesRead? = preferencesResponse

        override suspend fun putPreferences(authorization: String, payload: UserPreferencesWrite): UserPreferencesRead {
            lastPreferencesWritePayload = payload
            return UserPreferencesRead(data = payload.data)
        }

        override suspend fun deleteAccount(authorization: String) {
            deleteAccountThrowable?.let { throw it }
        }

        override suspend fun registerFcmToken(authorization: String, payload: FcmTokenRequest): FcmTokenResponse {
            fcmTokenThrowable?.let { throw it }
            lastRegisteredFcmToken = payload.token
            return FcmTokenResponse(id = "fcm-token-id")
        }

        override suspend fun unregisterFcmToken(authorization: String, token: String) {
            fcmTokenThrowable?.let { throw it }
            lastUnregisteredFcmToken = token
        }
    }

    private class FakeDashboardCache : DashboardCache {
        var savedDashboard: DashboardResponse? = null
            private set
        var savedCachedAt: String? = null
            private set
        var clearCallCount = 0
            private set

        override suspend fun load(): CachedDashboard? =
            savedDashboard?.let { CachedDashboard(it, requireNotNull(savedCachedAt)) }

        override suspend fun save(dashboard: DashboardResponse, cachedAt: String) {
            savedDashboard = dashboard
            savedCachedAt = cachedAt
        }

        override fun clear() {
            clearCallCount++
            savedDashboard = null
            savedCachedAt = null
        }
    }

    private class FakeSessionController(token: String?, private val logoutIntent: android.content.Intent? = null) :
        SessionController {
        private var currentToken: String? = token
        var completeLogoutCallCount = 0
            private set
        override val sessionState =
            MutableStateFlow<SessionState>(
                if (token == null) SessionState.LoggedOut else SessionState.Authenticated(hasRefreshToken = true)
            )

        override suspend fun createAuthorizationIntent() = throw UnsupportedOperationException()

        override suspend fun handleAuthorizationResponse(intent: android.content.Intent?) = Result.success(Unit)

        override suspend fun getFreshAccessToken(): String? = currentToken

        override suspend fun logout() {
            currentToken = null
            sessionState.value = SessionState.LoggedOut
        }

        override suspend fun buildLogoutIntent(): android.content.Intent? = logoutIntent

        override fun completeLogout() {
            completeLogoutCallCount++
            currentToken = null
            sessionState.value = SessionState.LoggedOut
        }
    }
}

private fun sampleDashboard(): DashboardResponse = DashboardResponse(
    asOf = "2026-05-26T12:00:00Z",
    identity = Identity(id = 1, username = "demo", displayName = "Demo User", isAdmin = false),
    workContext =
    WorkContext(
        scheduleType = "5-shift",
        teamNumber = 1,
        effectiveTeamNumber = 1,
        state = "ready",
        featureFlags = FeatureFlags(timeOffEnabled = true)
    ),
    currentStatus =
    CurrentStatus(
        asOf = "2026-05-26T12:00:00Z",
        currentShift = null,
        currentlyWorkingTeam = null,
        offDayProgress = null
    ),
    nextShifts = NextShifts(asOf = "2026-05-26T12:00:00Z", items = emptyList()),
    teamStatus = TeamStatus(asOf = "2026-05-26T12:00:00Z", items = emptyList()),
    timeOffSummary =
    TimeOffSummary(
        asOf = "2026-05-26T12:00:00Z",
        activeItems = emptyList(),
        upcomingItems = emptyList(),
        totalUpcoming = 0
    )
)

private fun sampleTask(userId: Int, id: String = "task-1", text: String = "Task"): TaskRecord = TaskRecord(
    id = id,
    userId = userId,
    labelId = null,
    text = text,
    startTime = "2026-05-26T12:00:00Z",
    stopTime = null,
    includesBreak = false,
    createdAt = "2026-05-26T12:00:00Z"
)

private fun sampleLabel(id: String = "label-1", name: String = "Focus", color: String = "#FF0000"): LabelRecord =
    LabelRecord(id = id, userId = 1, name = name, color = color, createdAt = "2026-05-26T12:00:00Z")

private fun sampleTemplate(id: String = "template-1", text: String = "Deep work"): TemplateRecord = TemplateRecord(
    id = id,
    userId = 1,
    labelId = null,
    text = text,
    startTime = "09:00:00",
    stopTime = "11:00:00",
    createdAt = "2026-05-26T12:00:00Z"
)

private fun sampleTimeOffEntry(
    entryId: String = "entry-1",
    entryKind: String = "date",
    entryType: String = "vacation"
): TimeOffEntryRecord = TimeOffEntryRecord(
    id = 1,
    entryId = entryId,
    userId = 1,
    entryKind = entryKind,
    date = "2026-06-01",
    startDate = null,
    endDate = null,
    weekday = null,
    entryType = entryType,
    entryFlag = "full_day",
    note = null,
    createdAt = "2026-05-26T12:00:00Z",
    updatedAt = "2026-05-26T12:00:00Z"
)

private fun httpException(code: Int): HttpException {
    val response = Response.error<String>(code, "".toResponseBody("text/plain".toMediaType()))
    return HttpException(response)
}

private val patchJson = Json { explicitNulls = false }
