package com.worktime.android.feature.dashboard

import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.model.WorkLocationRecord
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        kotlinx.coroutines.Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        kotlinx.coroutines.Dispatchers.resetMain()
    }

    @Test
    fun startsInLoadingAndThenPublishesSuccess() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(
            result = DashboardLoadResult.Success(sampleDashboard()),
        )

        val viewModel = DashboardViewModel(repository)
        assertEquals(DashboardUiState.Loading, viewModel.uiState.value)

        advanceUntilIdle()
        assertTrue(viewModel.uiState.value is DashboardUiState.Success)
    }

    @Test
    fun publishesLoggedOutStateFromRepository() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(result = DashboardLoadResult.LoggedOut)

        val viewModel = DashboardViewModel(repository)

        advanceUntilIdle()
        assertEquals(DashboardUiState.LoggedOut, viewModel.uiState.value)
    }

    @Test
    fun publishesErrorState() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(
            result = DashboardLoadResult.Error("Unable to load Worktime data (500)"),
        )

        val viewModel = DashboardViewModel(repository)

        advanceUntilIdle()
        assertEquals(
            DashboardUiState.Error("Unable to load Worktime data (500)"),
            viewModel.uiState.value,
        )
    }

    @Test
    fun staysLoadingWhileRequestIsPending() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val repository = FakeDashboardRepository(
            result = DashboardLoadResult.Success(sampleDashboard()),
            gate = gate,
        )

        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()
        assertEquals(DashboardUiState.Loading, viewModel.uiState.value)

        gate.complete(Unit)
        advanceUntilIdle()
        assertTrue(viewModel.uiState.value is DashboardUiState.Success)
    }

    @Test
    fun surfacesValidationMessageForMutationFailures() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(
            result = DashboardLoadResult.Success(sampleDashboard()),
            startTrackingResult = MutationResult.ValidationError("Request validation failed"),
        )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.startTimeTracking("Focus work")
        advanceUntilIdle()

        assertEquals("Request validation failed", viewModel.actionsState.value.message)
    }

    private class FakeDashboardRepository(
        private val result: DashboardLoadResult,
        private val gate: CompletableDeferred<Unit>? = null,
        private val startTrackingResult: MutationResult<TaskRecord> = MutationResult.Success(sampleTask()),
    ) : DashboardRepository {
        override val sessionState = MutableStateFlow<SessionState>(SessionState.Authenticated(hasRefreshToken = true))

        override suspend fun loadDashboard(): DashboardLoadResult {
            gate?.await()
            return result
        }

        override fun logout() {
            sessionState.value = SessionState.LoggedOut
        }

        override suspend fun startTimeTracking(text: String, labelId: String?): MutationResult<TaskRecord> = startTrackingResult

        override suspend fun stopTimeTracking(taskId: String): MutationResult<TaskRecord> = MutationResult.Success(sampleTask())

        override suspend fun updateTask(
            taskId: String,
            text: String?,
            labelId: String?,
        ): MutationResult<TaskRecord> = MutationResult.Success(sampleTask())

        override suspend fun getRunningTask(): MutationResult<TaskRecord?> = MutationResult.Success(null)

        override suspend fun setWorkLocation(
            date: LocalDate,
            countryCode: String,
            label: String?,
        ): MutationResult<WorkLocationRecord> = MutationResult.Success(
            WorkLocationRecord(
                id = 1,
                userId = 1,
                date = date.toString(),
                countryCode = countryCode,
                label = label,
                createdAt = "2026-05-26T12:00:00Z",
            ),
        )

        override suspend fun loadWeeklyWorkLocations(until: LocalDate): MutationResult<List<WorkLocationRecord>> =
            MutationResult.Success(emptyList())

        override suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse> =
            MutationResult.Success(SyncStatusResponse(serverTimestamp = "2026-05-26T12:00:00Z"))
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

private fun sampleTask(): TaskRecord = TaskRecord(
    id = "task-1",
    userId = 1,
    labelId = null,
    text = "Focus work",
    startTime = "2026-05-26T12:00:00Z",
    stopTime = null,
    includesBreak = false,
    createdAt = "2026-05-26T12:00:00Z",
)
