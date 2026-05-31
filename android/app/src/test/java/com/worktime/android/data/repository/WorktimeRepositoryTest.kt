package com.worktime.android.data.repository

import com.worktime.android.core.auth.SessionController
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.model.WorkLocationListResponse
import com.worktime.android.data.model.WorkLocationMutationRequest
import com.worktime.android.data.model.WorkLocationRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
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
        val repository = WorktimeRepository(
            api = FakeApi(),
            sessionController = FakeSessionController(token = null),
        )

        val result = repository.loadDashboard()

        assertEquals(DashboardLoadResult.LoggedOut, result)
    }

    @Test
    fun loadDashboardReturnsSuccessForHappyPath() = runTest {
        val dashboard = sampleDashboard()
        val repository = WorktimeRepository(
            api = FakeApi(response = dashboard),
            sessionController = FakeSessionController(token = "token-123"),
        )

        val result = repository.loadDashboard()

        assertTrue(result is DashboardLoadResult.Success)
        assertEquals(dashboard, (result as DashboardLoadResult.Success).dashboard)
    }

    @Test
    fun loadDashboardMapsUnauthorizedToLoggedOut() = runTest {
        val sessionController = FakeSessionController(token = "expired-token")
        val repository = WorktimeRepository(
            api = FakeApi(dashboardThrowable = httpException(401)),
            sessionController = sessionController,
        )

        val result = repository.loadDashboard()

        assertEquals(DashboardLoadResult.LoggedOut, result)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun startTrackingReturnsValidationErrorForBadRequest() = runTest {
        val repository = WorktimeRepository(
            api = FakeApi(taskThrowable = httpException(400)),
            sessionController = FakeSessionController(token = "token-123"),
        )
        repository.loadDashboard()

        val result = repository.startTimeTracking("Focus")

        assertEquals(MutationResult.ValidationError("Request validation failed"), result)
    }

    @Test
    fun updateTaskReturnsLoggedOutOnUnauthorized() = runTest {
        val sessionController = FakeSessionController(token = "token-123")
        val repository = WorktimeRepository(
            api = FakeApi(taskThrowable = httpException(401)),
            sessionController = sessionController,
        )
        repository.loadDashboard()

        val result = repository.updateTask("task-1", "Updated", null)

        assertEquals(MutationResult.LoggedOut, result)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun setWorkLocationReturnsSuccess() = runTest {
        val repository = WorktimeRepository(
            api = FakeApi(),
            sessionController = FakeSessionController(token = "token-123"),
        )
        repository.loadDashboard()

        val result = repository.setWorkLocation(
            date = java.time.LocalDate.parse("2026-05-26"),
            countryCode = "de",
            label = "Office",
        )

        assertTrue(result is MutationResult.Success)
        assertEquals("DE", (result as MutationResult.Success).value.countryCode)
    }

    private class FakeApi(
        private val response: DashboardResponse = sampleDashboard(),
        private val dashboardThrowable: Throwable? = null,
        private val taskThrowable: Throwable? = null,
    ) : WorktimeApi {
        override suspend fun getDashboard(authorization: String, timezone: String): DashboardResponse {
            dashboardThrowable?.let { throw it }
            return response
        }

        override suspend fun createTask(
            authorization: String,
            userId: Int,
            payload: TaskMutationRequest,
        ): TaskRecord {
            taskThrowable?.let { throw it }
            return sampleTask(userId = userId, text = payload.text ?: "Task")
        }

        override suspend fun updateTask(
            authorization: String,
            taskId: String,
            userId: Int,
            payload: TaskMutationRequest,
        ): TaskRecord {
            taskThrowable?.let { throw it }
            return sampleTask(userId = userId, id = taskId, text = payload.text ?: "Task")
        }

        override suspend fun getRunningTask(
            authorization: String,
            userId: Int,
        ): Response<TaskRecord> = Response.success(sampleTask(userId = userId))

        override suspend fun upsertWorkLocation(
            authorization: String,
            userId: Int,
            payload: WorkLocationMutationRequest,
        ): WorkLocationRecord {
            return WorkLocationRecord(
                id = 1,
                userId = userId,
                date = payload.date,
                countryCode = payload.countryCode.uppercase(),
                label = payload.label,
                createdAt = "2026-05-26T12:00:00Z",
            )
        }

        override suspend fun listWorkLocations(
            authorization: String,
            userId: Int,
            startDate: String?,
            endDate: String?,
        ): WorkLocationListResponse = WorkLocationListResponse(
            items = emptyList(),
            total = 0,
        )

        override suspend fun deleteLabel(
            authorization: String,
            labelId: String,
            userId: Int,
        ) {}

        override suspend fun getSyncStatus(authorization: String): SyncStatusResponse = SyncStatusResponse(
            serverTimestamp = "2026-05-26T12:00:00Z",
        )
    }

    private class FakeSessionController(
        token: String?,
    ) : SessionController {
        private var currentToken: String? = token
        override val sessionState = MutableStateFlow<SessionState>(
            if (token == null) SessionState.LoggedOut else SessionState.Authenticated(hasRefreshToken = true),
        )

        override suspend fun createAuthorizationIntent() = throw UnsupportedOperationException()

        override suspend fun handleAuthorizationResponse(intent: android.content.Intent?) = Result.success(Unit)

        override suspend fun getFreshAccessToken(): String? = currentToken

        override fun logout() {
            currentToken = null
            sessionState.value = SessionState.LoggedOut
        }
    }
}

private fun sampleDashboard(): DashboardResponse = DashboardResponse(
    asOf = "2026-05-26T12:00:00Z",
    identity = Identity(id = 1, username = "demo", displayName = "Demo User", isAdmin = false),
    workContext = WorkContext(
        scheduleType = "5-shift",
        teamNumber = 1,
        effectiveTeamNumber = 1,
        state = "ready",
        featureFlags = FeatureFlags(timeOffEnabled = true),
    ),
    currentStatus = CurrentStatus(
        asOf = "2026-05-26T12:00:00Z",
        currentShift = null,
        currentlyWorkingTeam = null,
        offDayProgress = null,
    ),
    nextShifts = NextShifts(asOf = "2026-05-26T12:00:00Z", items = emptyList()),
    teamStatus = TeamStatus(asOf = "2026-05-26T12:00:00Z", items = emptyList()),
    timeOffSummary = TimeOffSummary(
        asOf = "2026-05-26T12:00:00Z",
        activeItems = emptyList(),
        upcomingItems = emptyList(),
        totalUpcoming = 0,
    ),
)

private fun sampleTask(userId: Int, id: String = "task-1", text: String = "Task"): TaskRecord = TaskRecord(
    id = id,
    userId = userId,
    labelId = null,
    text = text,
    startTime = "2026-05-26T12:00:00Z",
    stopTime = null,
    includesBreak = false,
    createdAt = "2026-05-26T12:00:00Z",
)

private fun httpException(code: Int): HttpException {
    val response = Response.error<String>(code, "".toResponseBody("text/plain".toMediaType()))
    return HttpException(response)
}
