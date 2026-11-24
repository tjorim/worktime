package com.worktime.android.feature.dashboard

import com.worktime.android.core.auth.SessionState
import com.worktime.android.core.network.ConnectivityObserver
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.repository.CachedDashboard
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import com.worktime.android.data.repository.WorkLocationPreferences
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/** An initial success followed by partial failures and recovery must never read as "nothing there" (#2093). */
@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelRefreshFailureTest {
    private val dispatcher = StandardTestDispatcher()
    private val clock = Clock.fixed(Instant.parse("2026-05-26T12:30:00Z"), ZoneOffset.UTC)
    private val repository = mockk<DashboardRepository>()
    private val sessionState = MutableStateFlow<SessionState>(SessionState.Authenticated(true, sessionId = 1))
    private val offline = MutationResult.Error("Can't reach Worktime. Check your connection and retry.")

    @Before
    fun setUp() {
        kotlinx.coroutines.Dispatchers.setMain(dispatcher)
        every { repository.sessionState } returns sessionState
        every { repository.apiEnvironment } returns "test"
        coEvery { repository.loadCachedDashboard() } returns null
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard())
        coEvery { repository.getRunningTask() } returns MutationResult.Success(sampleTask())
        coEvery { repository.listTasks(any(), any()) } returns MutationResult.Success(emptyList())
        coEvery { repository.loadWeeklyWorkLocations(any()) } returns MutationResult.Success(emptyList())
        coEvery { repository.loadSyncStatus() } returns
            MutationResult.Success(SyncStatusResponse(serverTimestamp = "2026-05-26T12:00:00Z"))
        coEvery { repository.loadWorkLocationPreferences() } returns
            MutationResult.Success(WorkLocationPreferences(homeCountry = "BE"))
        coEvery { repository.listLabels() } returns MutationResult.Success(listOf(sampleLabel()))
        coEvery { repository.listTemplates() } returns MutationResult.Success(listOf(sampleTemplate()))
        coEvery { repository.startTimeTracking(any(), any()) } returns MutationResult.Success(sampleTask())
        coEvery { repository.stopTimeTracking(any()) } returns MutationResult.Success(sampleTask())
    }

    @After
    fun tearDown() {
        kotlinx.coroutines.Dispatchers.resetMain()
    }

    private fun viewModel(connectivity: ConnectivityObserver = ConnectivityObserver.Disabled) =
        DashboardViewModel(repository, connectivity, clock = clock)

    @Test
    fun `a failed timer read after a success keeps the running timer as stale`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()
        assertEquals(ReadStatus.Confirmed, viewModel.actionsState.value.timerStatus)

        coEvery { repository.getRunningTask() } returns offline
        viewModel.refreshActions()
        advanceUntilIdle()

        val state = viewModel.actionsState.value
        assertEquals(sampleTask(), state.runningTask)
        assertEquals(ReadStatus.Stale, state.timerStatus)
        assertEquals("2026-05-26T12:30:00Z", state.timerConfirmedAt)
        assertTrue(state.refreshFailed)
        assertFalse(state.canStartTimer)
    }

    @Test
    fun `a confirmed absence is distinct from an unknown timer`() = runTest(dispatcher) {
        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        val confirmed = viewModel()
        advanceUntilIdle()

        assertNull(confirmed.actionsState.value.runningTask)
        assertEquals(ReadStatus.Confirmed, confirmed.actionsState.value.timerStatus)
        assertTrue(confirmed.actionsState.value.canStartTimer)

        coEvery { repository.getRunningTask() } returns offline
        val unknown = viewModel()
        advanceUntilIdle()

        assertNull(unknown.actionsState.value.runningTask)
        assertEquals(ReadStatus.Unknown, unknown.actionsState.value.timerStatus)
        assertFalse(unknown.actionsState.value.canStartTimer)
    }

    @Test
    fun `starting a timer is refused while the timer status is unknown or stale`() = runTest(dispatcher) {
        coEvery { repository.getRunningTask() } returns offline
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.startTimeTracking("Focus work")
        advanceUntilIdle()

        coVerify(exactly = 0) { repository.startTimeTracking(any(), any()) }
        assertTrue(viewModel.actionsState.value.message.orEmpty().contains("running timer"))
        assertFalse(viewModel.actionsState.value.isSubmitting)
    }

    @Test
    fun `starting a timer goes through once the status is confirmed`() = runTest(dispatcher) {
        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        val viewModel = viewModel()
        advanceUntilIdle()

        viewModel.startTimeTracking("Focus work")
        advanceUntilIdle()

        coVerify(exactly = 1) { repository.startTimeTracking("Focus work", null) }
    }

    @Test
    fun `the planned task is kept and marked stale when only its read fails`() = runTest(dispatcher) {
        coEvery { repository.listTasks(any(), any()) } returns MutationResult.Success(listOf(plannedTask()))
        val viewModel = viewModel()
        advanceUntilIdle()
        assertEquals(plannedTask().id, viewModel.actionsState.value.plannedTask?.id)

        coEvery { repository.listTasks(any(), any()) } returns offline
        viewModel.refreshActions()
        advanceUntilIdle()

        val state = viewModel.actionsState.value
        assertEquals(plannedTask().id, state.plannedTask?.id)
        assertEquals(ReadStatus.Stale, state.plannedTaskStatus)
        assertEquals(ReadStatus.Confirmed, state.timerStatus)
    }

    @Test
    fun `a planned task that is really gone is cleared by a successful read`() = runTest(dispatcher) {
        coEvery { repository.listTasks(any(), any()) } returns MutationResult.Success(listOf(plannedTask()))
        val viewModel = viewModel()
        advanceUntilIdle()

        coEvery { repository.listTasks(any(), any()) } returns MutationResult.Success(emptyList())
        viewModel.refreshActions()
        advanceUntilIdle()

        assertNull(viewModel.actionsState.value.plannedTask)
        assertEquals(ReadStatus.Confirmed, viewModel.actionsState.value.plannedTaskStatus)
    }

    @Test
    fun `failed reads keep labels templates locations preferences and sync status`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()
        val before = viewModel.actionsState.value

        coEvery { repository.loadWeeklyWorkLocations(any()) } returns offline
        coEvery { repository.loadSyncStatus() } returns offline
        coEvery { repository.loadWorkLocationPreferences() } returns offline
        coEvery { repository.listLabels() } returns offline
        coEvery { repository.listTemplates() } returns offline
        viewModel.refreshActions()
        advanceUntilIdle()

        val after = viewModel.actionsState.value
        assertEquals(listOf(sampleLabel()), after.labels)
        assertEquals(listOf(sampleTemplate()), after.templates)
        assertEquals(before.workLocationPreferences, after.workLocationPreferences)
        assertEquals(before.syncStatus, after.syncStatus)
        assertEquals(before.weeklyWorkLocations, after.weeklyWorkLocations)
        assertTrue(after.refreshFailed)
    }

    @Test
    fun `the next successful refresh recovers every status`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()
        coEvery { repository.getRunningTask() } returns offline
        viewModel.refreshActions()
        advanceUntilIdle()

        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        viewModel.refreshActions()
        advanceUntilIdle()

        val state = viewModel.actionsState.value
        assertNull(state.runningTask)
        assertEquals(ReadStatus.Confirmed, state.timerStatus)
        assertFalse(state.refreshFailed)
        assertTrue(state.canStartTimer)
    }

    @Test
    fun `an in-place dashboard failure keeps the data and says how old it is`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()
        assertEquals(DashboardUiState.Success(sampleDashboard()), viewModel.uiState.value)

        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Error("Can't reach Worktime.")
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(
            DashboardUiState.Success(
                sampleDashboard(),
                staleAsOf = "2026-05-26T12:30:00Z",
                refreshError = "Can't reach Worktime."
            ),
            viewModel.uiState.value
        )

        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard())
        viewModel.refresh()
        advanceUntilIdle()

        assertEquals(DashboardUiState.Success(sampleDashboard()), viewModel.uiState.value)
    }

    @Test
    fun `a failed refresh over the cold-start cache keeps the cache time and reports the failure`() =
        runTest(dispatcher) {
            val cached = CachedDashboard(sampleDashboard(), cachedAt = "2026-05-25T09:00:00Z")
            coEvery { repository.loadCachedDashboard() } returns cached
            coEvery { repository.loadDashboard() } returns DashboardLoadResult.Error("Can't reach Worktime.")
            val viewModel = viewModel()
            advanceUntilIdle()

            assertEquals(
                DashboardUiState.Success(
                    sampleDashboard(),
                    staleAsOf = "2026-05-25T09:00:00Z",
                    refreshError = "Can't reach Worktime."
                ),
                viewModel.uiState.value
            )
        }

    @Test
    fun `reconnecting issues exactly one refresh worth of requests`() = runTest(dispatcher) {
        val connectivity = FakeConnectivityObserver()
        val viewModel = viewModel(connectivity)
        advanceUntilIdle()
        connectivity.emit(true) // initial status report, not a reconnect
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.loadDashboard() }
        coVerify(exactly = 1) { repository.getRunningTask() }

        connectivity.emit(false)
        advanceUntilIdle()
        coVerify(exactly = 1) { repository.loadDashboard() }

        connectivity.emit(true)
        advanceUntilIdle()

        // One dashboard read plus one read per action endpoint -- nothing is fetched twice.
        coVerify(exactly = 2) { repository.loadDashboard() }
        coVerify(exactly = 2) { repository.getRunningTask() }
        coVerify(exactly = 2) { repository.listTasks(any(), any()) }
        coVerify(exactly = 2) { repository.loadWeeklyWorkLocations(any()) }
        coVerify(exactly = 2) { repository.loadSyncStatus() }
        coVerify(exactly = 2) { repository.loadWorkLocationPreferences() }
        coVerify(exactly = 2) { repository.listLabels() }
        coVerify(exactly = 2) { repository.listTemplates() }
        assertEquals(ReadStatus.Confirmed, viewModel.actionsState.value.timerStatus)
    }

    @Test
    fun `reconnecting after an outage recovers a stale timer`() = runTest(dispatcher) {
        val connectivity = FakeConnectivityObserver()
        val viewModel = viewModel(connectivity)
        advanceUntilIdle()
        connectivity.emit(true)
        advanceUntilIdle()

        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Error("Can't reach Worktime.")
        coEvery { repository.getRunningTask() } returns offline
        viewModel.refresh()
        advanceUntilIdle()
        assertEquals(sampleTask(), viewModel.actionsState.value.runningTask)

        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard())
        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        connectivity.emit(false)
        connectivity.emit(true)
        advanceUntilIdle()

        assertEquals(DashboardUiState.Success(sampleDashboard()), viewModel.uiState.value)
        assertNull(viewModel.actionsState.value.runningTask)
        assertEquals(ReadStatus.Confirmed, viewModel.actionsState.value.timerStatus)
    }

    @Test
    fun `a stopped timer stays stopped when the follow-up read fails`() = runTest(dispatcher) {
        coEvery { repository.stopTimeTracking("task-1") } returns
            MutationResult.Success(sampleTask().copy(stopTime = "2026-05-26T12:45:00Z"))
        val viewModel = viewModel()
        advanceUntilIdle()
        assertEquals(sampleTask(), viewModel.actionsState.value.runningTask)

        coEvery { repository.getRunningTask() } returns offline
        viewModel.stopTimeTracking("task-1")
        advanceUntilIdle()

        // The write is applied locally so Stop can't be offered (and sent) twice, but with the
        // follow-up read failed the timer isn't confirmed, so Start waits for a successful refresh.
        val state = viewModel.actionsState.value
        assertNull(state.runningTask)
        assertEquals(ReadStatus.Stale, state.timerStatus)
        assertFalse(state.canStartTimer)
    }

    @Test
    fun `a started timer is shown even when the follow-up read fails`() = runTest(dispatcher) {
        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        val started = sampleTask().copy(id = "task-2", text = "New work")
        coEvery { repository.startTimeTracking("New work", null) } returns MutationResult.Success(started)
        val viewModel = viewModel()
        advanceUntilIdle()

        coEvery { repository.getRunningTask() } returns offline
        viewModel.startTimeTracking("New work")
        advanceUntilIdle()

        assertEquals(started, viewModel.actionsState.value.runningTask)
        assertEquals(ReadStatus.Stale, viewModel.actionsState.value.timerStatus)
    }

    @Test
    fun `an updated running task replaces the shown one even when the follow-up read fails`() = runTest(dispatcher) {
        val renamed = sampleTask().copy(text = "Renamed")
        coEvery { repository.updateTask("task-1", "Renamed", null) } returns MutationResult.Success(renamed)
        val viewModel = viewModel()
        advanceUntilIdle()

        coEvery { repository.getRunningTask() } returns offline
        viewModel.updateTask("task-1", "Renamed", null)
        advanceUntilIdle()

        assertEquals(renamed, viewModel.actionsState.value.runningTask)
    }

    @Test
    fun `a recovered timer endpoint clears the stale timer even while the dashboard still fails`() =
        runTest(dispatcher) {
            val connectivity = FakeConnectivityObserver()
            val viewModel = viewModel(connectivity)
            advanceUntilIdle()
            coEvery { repository.getRunningTask() } returns offline
            viewModel.refreshActions()
            advanceUntilIdle()
            assertEquals(ReadStatus.Stale, viewModel.actionsState.value.timerStatus)

            coEvery { repository.loadDashboard() } returns DashboardLoadResult.Error("Can't reach Worktime.")
            coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
            connectivity.emit(true)
            connectivity.emit(false)
            connectivity.emit(true)
            advanceUntilIdle()

            assertEquals(ReadStatus.Confirmed, viewModel.actionsState.value.timerStatus)
            assertTrue(viewModel.actionsState.value.canStartTimer)
            assertTrue((viewModel.uiState.value as DashboardUiState.Success).refreshError != null)
        }

    @Test
    fun `switching accounts drops retained values even when the new account's reads fail`() = runTest(dispatcher) {
        val viewModel = viewModel()
        advanceUntilIdle()
        assertEquals(listOf(sampleLabel()), viewModel.actionsState.value.labels)

        coEvery { repository.getRunningTask() } returns offline
        coEvery { repository.listLabels() } returns offline
        coEvery { repository.listTemplates() } returns offline
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Error("Can't reach Worktime.")
        sessionState.value = SessionState.Authenticated(true, sessionId = 2, accountKey = "account-b")
        advanceUntilIdle()

        val state = viewModel.actionsState.value
        assertNull(state.runningTask)
        assertEquals(ReadStatus.Unknown, state.timerStatus)
        assertTrue(state.labels.isEmpty())
        assertTrue(state.templates.isEmpty())
        assertTrue(viewModel.uiState.value is DashboardUiState.Error)
    }

    private class FakeConnectivityObserver : ConnectivityObserver {
        private val flow = MutableSharedFlow<Boolean>(replay = 1, extraBufferCapacity = 8)
        override val isOnline: Flow<Boolean> = flow

        fun emit(online: Boolean) {
            flow.tryEmit(online)
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

private fun sampleTask(): TaskRecord = TaskRecord(
    id = "task-1",
    labelId = null,
    text = "Focus work",
    startTime = "2026-05-26T12:00:00Z",
    stopTime = null,
    includesBreak = false,
    createdAt = "2026-05-26T12:00:00Z"
)

/** Starts a day from now with a stop time already set, so it counts as planned for any "now". */
private fun plannedTask(): TaskRecord = sampleTask().copy(
    id = "planned-1",
    startTime = Instant.now().plusSeconds(PLANNED_LEAD_SECONDS).toString(),
    stopTime = Instant.now().plusSeconds(PLANNED_LEAD_SECONDS * 2).toString()
)

private const val PLANNED_LEAD_SECONDS = 86_400L

private fun sampleLabel(): LabelRecord = LabelRecord(
    id = "label-1",
    name = "Focus",
    color = "#FF0000",
    createdAt = "2026-05-26T12:00:00Z"
)

private fun sampleTemplate(): TemplateRecord = TemplateRecord(
    id = "template-1",
    labelId = null,
    text = "Deep work",
    startTime = "09:00:00",
    stopTime = "11:00:00",
    createdAt = "2026-05-26T12:00:00Z"
)
