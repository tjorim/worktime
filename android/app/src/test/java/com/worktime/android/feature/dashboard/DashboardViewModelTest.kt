package com.worktime.android.feature.dashboard

import android.content.Intent
import app.cash.turbine.test
import com.worktime.android.core.auth.SessionState
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
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.model.WorkLocationRecord
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import com.worktime.android.data.repository.TimeOffDraft
import com.worktime.android.data.repository.WorkLocationPreferences
import io.mockk.mockk
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

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
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard())
            )

        val viewModel = DashboardViewModel(repository)
        viewModel.uiState.test {
            assertEquals(DashboardUiState.Loading, awaitItem())
            advanceUntilIdle()
            assertTrue(awaitItem() is DashboardUiState.Success)
            cancelAndIgnoreRemainingEvents()
        }
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
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Error("Unable to load Worktime data (500)")
            )

        val viewModel = DashboardViewModel(repository)

        advanceUntilIdle()
        assertEquals(
            DashboardUiState.Error("Unable to load Worktime data (500)"),
            viewModel.uiState.value
        )
    }

    @Test
    fun staysLoadingWhileRequestIsPending() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                gate = gate
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
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                startTrackingResult = MutationResult.ValidationError("Request validation failed")
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.startTimeTracking("Focus work")
        advanceUntilIdle()

        assertEquals("Request validation failed", viewModel.actionsState.value.message)
    }

    @Test
    fun deleteAccountLogsOutOnSuccess() = runTest(dispatcher) {
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                deleteAccountResult = MutationResult.Success(Unit)
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.deleteAccount()
        advanceUntilIdle()

        assertEquals(DashboardUiState.LoggedOut, viewModel.uiState.value)
        assertEquals(false, viewModel.actionsState.value.isDeletingAccount)
        assertEquals(null, viewModel.actionsState.value.deleteAccountError)
    }

    @Test
    fun deleteAccountSurfacesErrorAndStaysSignedInOnFailure() = runTest(dispatcher) {
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                deleteAccountResult = MutationResult.Error("Request failed (500)")
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.deleteAccount()
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value is DashboardUiState.Success)
        assertEquals(false, viewModel.actionsState.value.isDeletingAccount)
        assertEquals("Request failed (500)", viewModel.actionsState.value.deleteAccountError)
    }

    @Test
    fun logoutKeepsLocalSessionUntilTheProviderFlowReturns() = runTest(dispatcher) {
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                logoutIntentResult = mockk<Intent>()
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.logout()
        advanceUntilIdle()

        // The browser is still open. Reporting "signed out" here would leave the provider
        // session alive behind a signed-out UI, and the next sign-in would then complete
        // with no credential prompt.
        assertNotEquals(DashboardUiState.LoggedOut, viewModel.uiState.value)
        assertEquals(0, repository.completeLogoutCallCount)
    }

    @Test
    fun logoutEmitsTheProviderIntentForTheUiToLaunch() = runTest(dispatcher) {
        val intent = mockk<Intent>()
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                logoutIntentResult = intent
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.logoutIntent.test {
            viewModel.logout()
            advanceUntilIdle()
            assertEquals(intent, awaitItem())
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun logoutCompletesOnceTheFlowFinishesRegardlessOfOutcome() = runTest(dispatcher) {
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                logoutIntentResult = mockk<Intent>()
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.logout()
        advanceUntilIdle()
        viewModel.onLogoutFlowFinished()
        advanceUntilIdle()

        assertEquals(DashboardUiState.LoggedOut, viewModel.uiState.value)
        assertEquals(1, repository.completeLogoutCallCount)
    }

    @Test
    fun logoutCompletesImmediatelyWhenThereIsNoProviderFlowToRun() = runTest(dispatcher) {
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                logoutIntentResult = null
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.logout()
        advanceUntilIdle()

        assertEquals(DashboardUiState.LoggedOut, viewModel.uiState.value)
        assertEquals(1, repository.completeLogoutCallCount)
    }

    @Test
    fun refreshActionsPopulatesLabelsAndTemplates() = runTest(dispatcher) {
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                listLabelsResult = MutationResult.Success(listOf(sampleLabel())),
                listTemplatesResult = MutationResult.Success(listOf(sampleTemplate())),
                workLocationPreferencesResult =
                MutationResult.Success(WorkLocationPreferences(homeCountry = "BE", officeCountry = "NL"))
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        assertEquals(listOf(sampleLabel()), viewModel.actionsState.value.labels)
        assertEquals(listOf(sampleTemplate()), viewModel.actionsState.value.templates)
        assertEquals(
            WorkLocationPreferences(homeCountry = "BE", officeCountry = "NL"),
            viewModel.actionsState.value.workLocationPreferences
        )
    }

    @Test
    fun createLabelSurfacesConflictMessage() = runTest(dispatcher) {
        val repository =
            FakeDashboardRepository(
                result = DashboardLoadResult.Success(sampleDashboard()),
                createLabelResult = MutationResult.ValidationError("Label name must be unique")
            )
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.createLabel("Focus", "#FF0000")
        advanceUntilIdle()

        assertEquals("Label name must be unique", viewModel.actionsState.value.message)
    }

    @Test
    fun deleteWorkLocationSubmitsMutation() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(result = DashboardLoadResult.Success(sampleDashboard()))
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.deleteWorkLocation(LocalDate.parse("2026-06-01"))
        advanceUntilIdle()

        assertEquals(LocalDate.parse("2026-06-01"), repository.deletedWorkLocationDate)
        assertEquals("Saved", viewModel.actionsState.value.message)
    }

    @Test
    fun updateWorkLocationPreferencesSubmitsMutation() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(result = DashboardLoadResult.Success(sampleDashboard()))
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.updateWorkLocationPreferences(homeCountry = "BE", officeCountry = "NL")
        advanceUntilIdle()

        assertEquals("BE", repository.updatedHomeCountry)
        assertEquals("NL", repository.updatedOfficeCountry)
        assertEquals("Saved", viewModel.actionsState.value.message)
    }

    @Test
    fun updateLabelSubmitsMutation() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(result = DashboardLoadResult.Success(sampleDashboard()))
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.updateLabel("label-1", "Renamed", "#2196F3")
        advanceUntilIdle()

        assertEquals("label-1", repository.updatedLabelId)
        assertEquals("Renamed", repository.updatedLabelName)
        assertEquals("#2196F3", repository.updatedLabelColor)
        assertEquals("Saved", viewModel.actionsState.value.message)
    }

    @Test
    fun createTemplateSubmitsMutation() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(result = DashboardLoadResult.Success(sampleDashboard()))
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.createTemplate(
            text = "Standup",
            labelId = "label-1",
            startTime = LocalTime.parse("09:00"),
            stopTime = LocalTime.parse("09:15")
        )
        advanceUntilIdle()

        assertEquals("Standup", repository.createdTemplateText)
        assertEquals("label-1", repository.createdTemplateLabelId)
        assertEquals(LocalTime.parse("09:00"), repository.createdTemplateStartTime)
        assertEquals(LocalTime.parse("09:15"), repository.createdTemplateStopTime)
        assertEquals("Saved", viewModel.actionsState.value.message)
    }

    @Test
    fun deleteTemplateSubmitsMutation() = runTest(dispatcher) {
        val repository = FakeDashboardRepository(result = DashboardLoadResult.Success(sampleDashboard()))
        val viewModel = DashboardViewModel(repository)
        advanceUntilIdle()

        viewModel.deleteTemplate("template-1")
        advanceUntilIdle()

        assertEquals("template-1", repository.deletedTemplateId)
        assertEquals("Saved", viewModel.actionsState.value.message)
    }

    private class FakeDashboardRepository(
        private val result: DashboardLoadResult,
        private val gate: CompletableDeferred<Unit>? = null,
        private val startTrackingResult: MutationResult<TaskRecord> = MutationResult.Success(sampleTask()),
        private val listLabelsResult: MutationResult<List<LabelRecord>> = MutationResult.Success(emptyList()),
        private val listTemplatesResult: MutationResult<List<TemplateRecord>> = MutationResult.Success(emptyList()),
        private val workLocationPreferencesResult: MutationResult<WorkLocationPreferences> =
            MutationResult.Success(WorkLocationPreferences()),
        private val createLabelResult: MutationResult<LabelRecord> = MutationResult.Success(sampleLabel()),
        private val deleteAccountResult: MutationResult<Unit> = MutationResult.Success(Unit),
        private val logoutIntentResult: Intent? = null
    ) : DashboardRepository {
        override val sessionState = MutableStateFlow<SessionState>(SessionState.Authenticated(hasRefreshToken = true))
        var completeLogoutCallCount = 0
            private set
        var updatedLabelId: String? = null
            private set
        var updatedLabelName: String? = null
            private set
        var updatedLabelColor: String? = null
            private set
        var createdTemplateText: String? = null
            private set
        var createdTemplateLabelId: String? = null
            private set
        var createdTemplateStartTime: LocalTime? = null
            private set
        var createdTemplateStopTime: LocalTime? = null
            private set
        var deletedWorkLocationDate: LocalDate? = null
            private set
        var updatedHomeCountry: String? = null
            private set
        var updatedOfficeCountry: String? = null
            private set
        var deletedTemplateId: String? = null
            private set

        override suspend fun loadDashboard(): DashboardLoadResult {
            gate?.await()
            return result
        }

        override suspend fun buildLogoutIntent(): Intent? = logoutIntentResult

        override fun completeLogout() {
            completeLogoutCallCount++
            sessionState.value = SessionState.LoggedOut
        }

        override suspend fun startTimeTracking(text: String, labelId: String?): MutationResult<TaskRecord> =
            startTrackingResult

        override suspend fun stopTimeTracking(taskId: String): MutationResult<TaskRecord> =
            MutationResult.Success(sampleTask())

        override suspend fun updateTask(taskId: String, text: String?, labelId: String?): MutationResult<TaskRecord> =
            MutationResult.Success(sampleTask())

        override suspend fun getRunningTask(): MutationResult<TaskRecord?> = MutationResult.Success(null)

        override suspend fun setWorkLocation(
            date: LocalDate,
            countryCode: String,
            label: String?
        ): MutationResult<WorkLocationRecord> = MutationResult.Success(
            WorkLocationRecord(
                id = 1,
                userId = 1,
                date = date.toString(),
                countryCode = countryCode,
                label = label,
                createdAt = "2026-05-26T12:00:00Z"
            )
        )

        override suspend fun loadWeeklyWorkLocations(until: LocalDate): MutationResult<List<WorkLocationRecord>> =
            MutationResult.Success(emptyList())

        override suspend fun getWorkLocation(date: LocalDate): MutationResult<WorkLocationRecord?> =
            MutationResult.Success(null)

        override suspend fun deleteWorkLocation(date: LocalDate): MutationResult<Unit> {
            deletedWorkLocationDate = date
            return MutationResult.Success(Unit)
        }

        override suspend fun loadWorkLocationPreferences(): MutationResult<WorkLocationPreferences> =
            workLocationPreferencesResult

        override suspend fun updateWorkLocationPreferences(
            homeCountry: String?,
            officeCountry: String?
        ): MutationResult<WorkLocationPreferences> {
            updatedHomeCountry = homeCountry
            updatedOfficeCountry = officeCountry
            return MutationResult.Success(WorkLocationPreferences(homeCountry, officeCountry))
        }

        override suspend fun listTasks(startDate: LocalDate?, endDate: LocalDate?): MutationResult<List<TaskRecord>> =
            MutationResult.Success(emptyList())

        override suspend fun deleteTask(taskId: String): MutationResult<Unit> = MutationResult.Success(Unit)

        override suspend fun createLabel(name: String, color: String): MutationResult<LabelRecord> = createLabelResult

        override suspend fun listLabels(): MutationResult<List<LabelRecord>> = listLabelsResult

        override suspend fun updateLabel(labelId: String, name: String?, color: String?): MutationResult<LabelRecord> {
            updatedLabelId = labelId
            updatedLabelName = name
            updatedLabelColor = color
            return MutationResult.Success(sampleLabel())
        }

        override suspend fun deleteLabel(labelId: String): MutationResult<Unit> = MutationResult.Success(Unit)

        override suspend fun createTemplate(
            text: String,
            labelId: String?,
            startTime: LocalTime,
            stopTime: LocalTime
        ): MutationResult<TemplateRecord> {
            createdTemplateText = text
            createdTemplateLabelId = labelId
            createdTemplateStartTime = startTime
            createdTemplateStopTime = stopTime
            return MutationResult.Success(sampleTemplate())
        }

        override suspend fun listTemplates(): MutationResult<List<TemplateRecord>> = listTemplatesResult

        override suspend fun updateTemplate(
            templateId: String,
            text: String?,
            labelId: String?,
            startTime: LocalTime?,
            stopTime: LocalTime?
        ): MutationResult<TemplateRecord> = MutationResult.Success(sampleTemplate())

        override suspend fun deleteTemplate(templateId: String): MutationResult<Unit> {
            deletedTemplateId = templateId
            return MutationResult.Success(Unit)
        }

        override suspend fun createTimeOffEntry(draft: TimeOffDraft): MutationResult<TimeOffEntryRecord> =
            throw UnsupportedOperationException()

        override suspend fun listTimeOffEntries(
            startDate: LocalDate?,
            endDate: LocalDate?
        ): MutationResult<List<TimeOffEntryRecord>> = MutationResult.Success(emptyList())

        override suspend fun getTimeOffEntry(entryId: String): MutationResult<TimeOffEntryRecord> =
            throw UnsupportedOperationException()

        override suspend fun updateTimeOffEntry(
            entryId: String,
            draft: TimeOffDraft
        ): MutationResult<TimeOffEntryRecord> = throw UnsupportedOperationException()

        override suspend fun deleteTimeOffEntry(entryId: String): MutationResult<Unit> =
            throw UnsupportedOperationException()

        override suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse> =
            MutationResult.Success(SyncStatusResponse(serverTimestamp = "2026-05-26T12:00:00Z"))

        override suspend fun deleteAccount(): MutationResult<Unit> = deleteAccountResult

        override suspend fun registerFcmToken(token: String): MutationResult<Unit> = MutationResult.Success(Unit)

        override suspend fun unregisterFcmToken(token: String): MutationResult<Unit> = MutationResult.Success(Unit)
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
    userId = 1,
    labelId = null,
    text = "Focus work",
    startTime = "2026-05-26T12:00:00Z",
    stopTime = null,
    includesBreak = false,
    createdAt = "2026-05-26T12:00:00Z"
)

private fun sampleLabel(): LabelRecord = LabelRecord(
    id = "label-1",
    userId = 1,
    name = "Focus",
    color = "#FF0000",
    createdAt = "2026-05-26T12:00:00Z"
)

private fun sampleTemplate(): TemplateRecord = TemplateRecord(
    id = "template-1",
    userId = 1,
    labelId = null,
    text = "Deep work",
    startTime = "09:00:00",
    stopTime = "11:00:00",
    createdAt = "2026-05-26T12:00:00Z"
)
