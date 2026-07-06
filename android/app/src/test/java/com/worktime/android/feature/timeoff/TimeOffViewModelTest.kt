package com.worktime.android.feature.timeoff

import app.cash.turbine.test
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.model.WorkLocationRecord
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import com.worktime.android.data.repository.TimeOffDraft
import java.time.LocalDate
import java.time.LocalTime
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class TimeOffViewModelTest {
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
        val repository = FakeRepository(listResult = MutationResult.Success(listOf(sampleEntry())))

        val viewModel = TimeOffViewModel(repository)
        viewModel.uiState.test {
            assertEquals(TimeOffUiState.Loading, awaitItem())
            advanceUntilIdle()
            assertTrue(awaitItem() is TimeOffUiState.Success)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun publishesLoggedOutStateFromRepository() = runTest(dispatcher) {
        val repository = FakeRepository(listResult = MutationResult.LoggedOut)

        val viewModel = TimeOffViewModel(repository)
        advanceUntilIdle()

        assertEquals(TimeOffUiState.LoggedOut, viewModel.uiState.value)
    }

    @Test
    fun publishesErrorState() = runTest(dispatcher) {
        val repository = FakeRepository(listResult = MutationResult.Error("Request failed (500)"))

        val viewModel = TimeOffViewModel(repository)
        advanceUntilIdle()

        assertEquals(TimeOffUiState.Error("Request failed (500)"), viewModel.uiState.value)
    }

    @Test
    fun submitSuccessTriggersRefreshAndClosesForm() = runTest(dispatcher) {
        val repository =
            FakeRepository(
                listResult = MutationResult.Success(listOf(sampleEntry())),
                createResult = MutationResult.Success(sampleEntry())
            )
        val viewModel = TimeOffViewModel(repository)
        advanceUntilIdle()

        viewModel.openCreateForm()
        viewModel.submit(
            TimeOffDraft.SingleDate(date = LocalDate.parse("2026-06-01"), entryType = "vacation", entryFlag = "full_day")
        )
        advanceUntilIdle()

        assertNull(viewModel.formState.value.target)
        assertTrue(viewModel.uiState.value is TimeOffUiState.Success)
    }

    @Test
    fun submitValidationErrorKeepsFormOpenAndSurfacesMessage() = runTest(dispatcher) {
        val repository =
            FakeRepository(
                listResult = MutationResult.Success(emptyList()),
                createResult = MutationResult.ValidationError("end_date must be after start_date")
            )
        val viewModel = TimeOffViewModel(repository)
        advanceUntilIdle()

        viewModel.openCreateForm()
        viewModel.submit(
            TimeOffDraft.SingleDate(date = LocalDate.parse("2026-06-01"), entryType = "vacation", entryFlag = "full_day")
        )
        advanceUntilIdle()

        assertEquals(TimeOffFormTarget.Create, viewModel.formState.value.target)
        assertEquals("end_date must be after start_date", viewModel.formState.value.message)
    }

    @Test
    fun deleteSuccessRefreshesList() = runTest(dispatcher) {
        val repository =
            FakeRepository(
                listResult = MutationResult.Success(listOf(sampleEntry())),
                deleteResult = MutationResult.Success(Unit)
            )
        val viewModel = TimeOffViewModel(repository)
        advanceUntilIdle()

        viewModel.delete("entry-1")
        advanceUntilIdle()

        assertTrue(viewModel.uiState.value is TimeOffUiState.Success)
        assertNull(viewModel.formState.value.target)
    }

    private class FakeRepository(
        private val listResult: MutationResult<List<TimeOffEntryRecord>> = MutationResult.Success(emptyList()),
        private val createResult: MutationResult<TimeOffEntryRecord> = MutationResult.Success(sampleEntry()),
        private val updateResult: MutationResult<TimeOffEntryRecord> = MutationResult.Success(sampleEntry()),
        private val deleteResult: MutationResult<Unit> = MutationResult.Success(Unit)
    ) : DashboardRepository {
        override val sessionState = MutableStateFlow<SessionState>(SessionState.Authenticated(hasRefreshToken = true))

        override suspend fun loadDashboard(): DashboardLoadResult = throw UnsupportedOperationException()

        override suspend fun startTimeTracking(text: String, labelId: String?) = throw UnsupportedOperationException()

        override suspend fun stopTimeTracking(taskId: String) = throw UnsupportedOperationException()

        override suspend fun updateTask(taskId: String, text: String?, labelId: String?) =
            throw UnsupportedOperationException()

        override suspend fun getRunningTask(): MutationResult<TaskRecord?> = throw UnsupportedOperationException()

        override suspend fun listTasks(startDate: LocalDate?, endDate: LocalDate?) =
            throw UnsupportedOperationException()

        override suspend fun deleteTask(taskId: String) = throw UnsupportedOperationException()

        override suspend fun setWorkLocation(date: LocalDate, countryCode: String, label: String?) =
            throw UnsupportedOperationException()

        override suspend fun loadWeeklyWorkLocations(until: LocalDate) = throw UnsupportedOperationException()

        override suspend fun getWorkLocation(date: LocalDate): MutationResult<WorkLocationRecord?> =
            throw UnsupportedOperationException()

        override suspend fun deleteWorkLocation(date: LocalDate) = throw UnsupportedOperationException()

        override suspend fun createLabel(name: String, color: String): MutationResult<LabelRecord> =
            throw UnsupportedOperationException()

        override suspend fun listLabels() = throw UnsupportedOperationException()

        override suspend fun updateLabel(labelId: String, name: String?, color: String?) =
            throw UnsupportedOperationException()

        override suspend fun deleteLabel(labelId: String) = throw UnsupportedOperationException()

        override suspend fun createTemplate(
            text: String,
            labelId: String?,
            startTime: LocalTime,
            stopTime: LocalTime
        ): MutationResult<TemplateRecord> = throw UnsupportedOperationException()

        override suspend fun listTemplates() = throw UnsupportedOperationException()

        override suspend fun updateTemplate(
            templateId: String,
            text: String?,
            labelId: String?,
            startTime: LocalTime?,
            stopTime: LocalTime?
        ) = throw UnsupportedOperationException()

        override suspend fun deleteTemplate(templateId: String) = throw UnsupportedOperationException()

        override suspend fun createTimeOffEntry(draft: TimeOffDraft): MutationResult<TimeOffEntryRecord> =
            createResult

        override suspend fun listTimeOffEntries(
            startDate: LocalDate?,
            endDate: LocalDate?
        ): MutationResult<List<TimeOffEntryRecord>> = listResult

        override suspend fun getTimeOffEntry(entryId: String): MutationResult<TimeOffEntryRecord> =
            throw UnsupportedOperationException()

        override suspend fun updateTimeOffEntry(entryId: String, draft: TimeOffDraft): MutationResult<TimeOffEntryRecord> =
            updateResult

        override suspend fun deleteTimeOffEntry(entryId: String): MutationResult<Unit> = deleteResult

        override suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse> = throw UnsupportedOperationException()

        override suspend fun deleteAccount(): MutationResult<Unit> = throw UnsupportedOperationException()

        override fun logout() {
            sessionState.value = SessionState.LoggedOut
        }
    }
}

private fun sampleEntry(): TimeOffEntryRecord = TimeOffEntryRecord(
    id = 1,
    entryId = "entry-1",
    userId = 1,
    entryKind = "date",
    date = "2026-06-01",
    startDate = null,
    endDate = null,
    weekday = null,
    entryType = "vacation",
    entryFlag = "full_day",
    note = null,
    createdAt = "2026-05-26T12:00:00Z",
    updatedAt = "2026-05-26T12:00:00Z"
)
