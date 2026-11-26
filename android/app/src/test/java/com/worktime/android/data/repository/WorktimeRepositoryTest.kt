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
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskListResponse
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TemplateListResponse
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.UserPreferencesRead
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.model.WorkLocationListResponse
import com.worktime.android.data.model.WorkLocationMutationRequest
import com.worktime.android.data.model.WorkLocationRecord
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import java.io.IOException
import java.time.LocalDate
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import retrofit2.HttpException
import retrofit2.Response

class WorktimeRepositoryTest {
    @Test
    fun refreshFailureReturnsRetryableErrorsInsteadOfLoggedOut() = runTest {
        val session = mockk<SessionController>()
        every { session.sessionState } returns MutableStateFlow(SessionState.Authenticated(true))
        coEvery { session.getFreshAccessToken() } throws IOException("offline")
        val repository = WorktimeRepository(api = FakeApi(), sessionController = session)

        assertTrue(repository.loadDashboard() is DashboardLoadResult.Error)
        assertTrue(repository.getWorkLocation(LocalDate.now()) is MutationResult.Error)
        assertTrue(repository.getRunningTask() is MutationResult.Error)
        assertTrue(repository.listLabels() is MutationResult.Error)
        // Token-only requests go through a separate helper that must also catch the failure.
        assertTrue(repository.listTemplates() is MutationResult.Error)
        assertTrue(repository.registerFcmToken("fcm") is MutationResult.Error)
    }

    @Test
    fun transportFailuresMapToActionableCopyWithoutLeakingDiagnostics() = runTest {
        val session = mockk<SessionController>()
        every { session.sessionState } returns MutableStateFlow(SessionState.Authenticated(true))
        val repository = WorktimeRepository(api = FakeApi(), sessionController = session)

        coEvery { session.getFreshAccessToken() } throws IOException("Unable to resolve host \"api.internal\"")
        val offline = "Can't reach Worktime. Check your connection and retry."
        assertEquals(DashboardLoadResult.Error(offline), repository.loadDashboard())
        assertEquals(MutationResult.Error(offline), repository.getRunningTask())

        coEvery { session.getFreshAccessToken() } throws SerializationException("Unexpected JSON token at offset 3")
        val unreadable = "Worktime sent data this app can't read. Retry, or update the app if it keeps happening."
        assertEquals(DashboardLoadResult.Error(unreadable), repository.loadDashboard())
        assertEquals(MutationResult.Error(unreadable), repository.getRunningTask())

        coEvery { session.getFreshAccessToken() } throws IllegalStateException("db password is hunter2")
        assertEquals(
            DashboardLoadResult.Error("Something went wrong loading Worktime data. Retry in a moment."),
            repository.loadDashboard()
        )
        assertEquals(
            MutationResult.Error("Something went wrong. Retry in a moment."),
            repository.getRunningTask()
        )
    }

    @Test
    fun loadDashboardMapsServerErrorsToRetryCopyAndKeepsTheStatusForClientErrors() = runTest {
        val session = FakeSessionController(token = "token-123")
        val serverDown =
            WorktimeRepository(api = FakeApi(dashboardThrowable = httpException(503)), sessionController = session)
        val forbidden =
            WorktimeRepository(api = FakeApi(dashboardThrowable = httpException(403)), sessionController = session)

        assertEquals(
            DashboardLoadResult.Error("Worktime is having trouble right now. Retry in a moment."),
            serverDown.loadDashboard()
        )
        assertEquals(DashboardLoadResult.Error("Unable to load Worktime data (403)"), forbidden.loadDashboard())
    }

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
        assertTrue(sessionController.sessionState.value is SessionState.Authenticated)
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
    fun listTasksReturnsItemsWithoutLoadingDashboard() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(taskListResponse = TaskListResponse(items = listOf(sampleTask()), total = 1)),
                sessionController = FakeSessionController(token = "token-123")
            )
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
    fun loadWorkLocationPreferencesDefaultsWhenNoDocumentExists() = runTest {
        val repository =
            WorktimeRepository(api = FakeApi(), sessionController = FakeSessionController(token = "token-123"))

        assertEquals(MutationResult.Success(WorkLocationPreferences()), repository.loadWorkLocationPreferences())
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
}

internal class FakeApi(
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
    private val preferencesResponse: UserPreferencesRead? = null,
    private val fcmTokenThrowable: Throwable? = null
) : WorktimeApi {
    var lastRegisteredFcmToken: String? = null
        private set
    var lastUnregisteredFcmToken: String? = null
        private set

    /** When set, dashboard loads and task creation wait for it, so a test can change session mid-flight. */
    var gate: CompletableDeferred<Unit>? = null
    var createTaskCallCount = 0
        private set
    var getDashboardCallCount = 0
        private set

    override suspend fun getDashboard(authorization: String, timezone: String): DashboardResponse {
        getDashboardCallCount++
        gate?.await()
        dashboardThrowable?.let { throw it }
        return response
    }

    override suspend fun createTask(authorization: String, payload: TaskMutationRequest): TaskRecord {
        createTaskCallCount++
        gate?.await()
        taskThrowable?.let { throw it }
        return sampleTask(text = payload.text ?: "Task")
    }

    override suspend fun updateTask(authorization: String, taskId: String, payload: TaskMutationRequest): TaskRecord {
        taskThrowable?.let { throw it }
        return sampleTask(id = taskId, text = payload.text ?: "Task")
    }

    override suspend fun getRunningTask(authorization: String): Response<TaskRecord> = Response.success(sampleTask())

    override suspend fun listTasks(authorization: String, startDate: String?, endDate: String?): TaskListResponse {
        taskThrowable?.let { throw it }
        return taskListResponse
    }

    override suspend fun deleteTask(authorization: String, taskId: String) {
        taskThrowable?.let { throw it }
    }

    override suspend fun upsertWorkLocation(
        authorization: String,
        valueDate: String,
        payload: WorkLocationMutationRequest
    ): WorkLocationRecord = WorkLocationRecord(
        id = 1,
        date = valueDate,
        countryCode = payload.countryCode.uppercase(),
        label = payload.label,
        createdAt = "2026-05-26T12:00:00Z"
    )

    override suspend fun listWorkLocations(
        authorization: String,
        startDate: String?,
        endDate: String?
    ): WorkLocationListResponse = WorkLocationListResponse(
        items = emptyList(),
        total = 0
    )

    override suspend fun getWorkLocation(authorization: String, valueDate: String): Response<WorkLocationRecord> {
        workLocationThrowable?.let { throw it }
        if (workLocationNotFound) {
            return Response.error(404, "".toResponseBody("text/plain".toMediaType()))
        }
        return Response.success(
            WorkLocationRecord(
                id = 1,
                date = valueDate,
                countryCode = "BE",
                label = null,
                createdAt = "2026-05-26T12:00:00Z"
            )
        )
    }

    override suspend fun deleteWorkLocation(authorization: String, valueDate: String) {
        workLocationThrowable?.let { throw it }
    }

    override suspend fun createLabel(authorization: String, payload: LabelMutationRequest): LabelRecord {
        labelThrowable?.let { throw it }
        return sampleLabel(name = payload.name, color = payload.color)
    }

    override suspend fun listLabels(authorization: String): LabelListResponse {
        labelThrowable?.let { throw it }
        return labelListResponse
    }

    override suspend fun listTemplates(authorization: String): TemplateListResponse {
        templateThrowable?.let { throw it }
        return templateListResponse
    }

    override suspend fun getSyncStatus(authorization: String): SyncStatusResponse = SyncStatusResponse(
        serverTimestamp = "2026-05-26T12:00:00Z"
    )

    override suspend fun getPreferences(authorization: String): Response<UserPreferencesRead?> =
        if (preferencesResponse == null) {
            Response.success(204, null as UserPreferencesRead?)
        } else {
            Response.success(preferencesResponse)
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

internal class FakeSessionController(
    token: String?,
    private val logoutIntent: android.content.Intent? = null,
    accountKey: String? = "account-a"
) : SessionController {
    private var currentToken: String? = token
    var completeLogoutCallCount = 0
        private set
    var logoutCallCount = 0
        private set

    /** When set, token requests wait for it and then read the session current at that point. */
    var tokenGate: CompletableDeferred<Unit>? = null

    /** Runs while a logout is suspended (like provider discovery), before it ends the session. */
    var duringLogout: (suspend () -> Unit)? = null
    override val sessionState =
        MutableStateFlow<SessionState>(
            if (token == null) {
                SessionState.LoggedOut
            } else {
                SessionState.Authenticated(hasRefreshToken = true, sessionId = 1, accountKey = accountKey)
            }
        )

    /** Simulates a new sign-in (possibly another account) replacing whatever session was active. */
    fun signIn(token: String, sessionId: Long, accountKey: String?) {
        currentToken = token
        sessionState.value =
            SessionState.Authenticated(hasRefreshToken = true, sessionId = sessionId, accountKey = accountKey)
    }

    override suspend fun createAuthorizationIntent() = throw UnsupportedOperationException()

    override suspend fun handleAuthorizationResponse(intent: android.content.Intent?) = Result.success(Unit)

    override suspend fun getFreshAccessToken(): String? {
        tokenGate?.await()
        return currentToken
    }

    override suspend fun logout() {
        logoutCallCount++
        val ending = sessionState.value
        duringLogout?.invoke()
        // Like OidcSessionManager: only the session this logout was made for is ended.
        if (sessionState.value == ending) {
            currentToken = null
            sessionState.value = SessionState.LoggedOut
        }
    }

    override suspend fun buildLogoutIntent(): android.content.Intent? = logoutIntent

    override fun completeLogout() {
        completeLogoutCallCount++
        currentToken = null
        sessionState.value = SessionState.LoggedOut
    }
}

internal fun sampleDashboard(): DashboardResponse = DashboardResponse(
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

private fun sampleTask(id: String = "task-1", text: String = "Task"): TaskRecord = TaskRecord(
    id = id,
    labelId = null,
    text = text,
    startTime = "2026-05-26T12:00:00Z",
    stopTime = null,
    includesBreak = false,
    createdAt = "2026-05-26T12:00:00Z"
)

private fun sampleLabel(id: String = "label-1", name: String = "Focus", color: String = "#FF0000"): LabelRecord =
    LabelRecord(id = id, name = name, color = color, createdAt = "2026-05-26T12:00:00Z")

private fun sampleTemplate(id: String = "template-1", text: String = "Deep work"): TemplateRecord = TemplateRecord(
    id = id,
    labelId = null,
    text = text,
    startTime = "09:00:00",
    stopTime = "11:00:00",
    createdAt = "2026-05-26T12:00:00Z"
)

internal fun httpException(code: Int): HttpException {
    val response = Response.error<String>(code, "".toResponseBody("text/plain".toMediaType()))
    return HttpException(response)
}
