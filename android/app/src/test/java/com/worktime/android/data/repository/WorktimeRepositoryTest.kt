package com.worktime.android.data.repository

import com.worktime.android.core.auth.SessionController
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
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
            api = FakeApi(throwable = httpException(401)),
            sessionController = sessionController,
        )

        val result = repository.loadDashboard()

        assertEquals(DashboardLoadResult.LoggedOut, result)
        assertEquals(SessionState.LoggedOut, sessionController.sessionState.value)
    }

    @Test
    fun loadDashboardMapsNetworkFailureToError() = runTest {
        val repository = WorktimeRepository(
            api = FakeApi(throwable = java.io.IOException("boom")),
            sessionController = FakeSessionController(token = "token-123"),
        )

        val result = repository.loadDashboard()

        assertEquals(
            DashboardLoadResult.Error("Unable to reach the Worktime backend"),
            result,
        )
    }

    private class FakeApi(
        private val response: DashboardResponse = sampleDashboard(),
        private val throwable: Throwable? = null,
    ) : WorktimeApi {
        override suspend fun getDashboard(authorization: String): DashboardResponse {
            throwable?.let { throw it }
            return response
        }
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

private fun httpException(code: Int): HttpException {
    val response = Response.error<String>(code, "".toResponseBody("text/plain".toMediaType()))
    return HttpException(response)
}
