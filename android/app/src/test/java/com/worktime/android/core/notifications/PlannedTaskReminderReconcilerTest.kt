package com.worktime.android.core.notifications

import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlannedTaskReminderReconcilerTest {
    private val repository = mockk<DashboardRepository>()
    private val reminderScheduler = mockk<ReminderScheduler>(relaxed = true)

    @Test
    fun `reconciles using the loaded account id, running task, and soonest planned task`() = runTest {
        val runningTask = sampleTask(id = "running-1", hoursFromNow = 0, isPlanned = false)
        val soonPlanned = sampleTask(id = "planned-soon", hoursFromNow = 1)
        val laterPlanned = sampleTask(id = "planned-later", hoursFromNow = 3)
        val pastTask = sampleTask(id = "past-1", hoursFromNow = -2)

        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard(accountId = 42))
        coEvery { repository.getRunningTask() } returns MutationResult.Success(runningTask)
        coEvery { repository.listTasks(any(), any()) } returns
            MutationResult.Success(listOf(laterPlanned, soonPlanned, pastTask))

        val result =
            reconcilePlannedTaskReminder(
                repository = repository,
                reminderScheduler = reminderScheduler,
                plannedTasksEnabled = true,
                timersEnabled = false
            )

        assertTrue(result)
        verify {
            reminderScheduler.reconcile(
                accountId = 42,
                plannedTask = soonPlanned,
                runningTask = runningTask,
                plannedTasksEnabled = true,
                timersEnabled = false
            )
        }
    }

    @Test
    fun `bails out without touching the scheduler when logged out`() = runTest {
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.LoggedOut

        val result =
            reconcilePlannedTaskReminder(
                repository = repository,
                reminderScheduler = reminderScheduler,
                plannedTasksEnabled = true,
                timersEnabled = true
            )

        assertFalse(result)
        coVerify(exactly = 0) { repository.getRunningTask() }
        verify(exactly = 0) { reminderScheduler.reconcile(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `bails out without touching the scheduler when the dashboard fetch errors`() = runTest {
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Error("Unable to reach the Worktime backend")

        val result =
            reconcilePlannedTaskReminder(
                repository = repository,
                reminderScheduler = reminderScheduler,
                plannedTasksEnabled = true,
                timersEnabled = true
            )

        assertFalse(result)
        verify(exactly = 0) { reminderScheduler.reconcile(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `bails out without touching the scheduler when the running-task fetch fails`() = runTest {
        // A transient failure here must never reach reconcile(): it cancels any alarm it isn't
        // given a task for, so folding "fetch failed" into "no task" would silently cancel an
        // already-correctly-scheduled reminder with no way to self-correct until the app reopens.
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard(accountId = 7))
        coEvery { repository.getRunningTask() } returns MutationResult.Error("Unable to reach the Worktime backend")

        val result =
            reconcilePlannedTaskReminder(
                repository = repository,
                reminderScheduler = reminderScheduler,
                plannedTasksEnabled = true,
                timersEnabled = true
            )

        assertFalse(result)
        coVerify(exactly = 0) { repository.listTasks(any(), any()) }
        verify(exactly = 0) { reminderScheduler.reconcile(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `bails out without touching the scheduler when the planned-task fetch fails`() = runTest {
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard(accountId = 7))
        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        coEvery { repository.listTasks(any(), any()) } returns
            MutationResult.Error("Unable to reach the Worktime backend")

        val result =
            reconcilePlannedTaskReminder(
                repository = repository,
                reminderScheduler = reminderScheduler,
                plannedTasksEnabled = true,
                timersEnabled = true
            )

        assertFalse(result)
        verify(exactly = 0) { reminderScheduler.reconcile(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `reconciles with no running or planned task when neither exists`() = runTest {
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard(accountId = 7))
        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        coEvery { repository.listTasks(any(), any()) } returns MutationResult.Success(emptyList())

        val result =
            reconcilePlannedTaskReminder(
                repository = repository,
                reminderScheduler = reminderScheduler,
                plannedTasksEnabled = true,
                timersEnabled = true
            )

        assertTrue(result)
        verify {
            reminderScheduler.reconcile(
                accountId = 7,
                plannedTask = null,
                runningTask = null,
                plannedTasksEnabled = true,
                timersEnabled = true
            )
        }
    }
}

private fun sampleTask(id: String, hoursFromNow: Int, isPlanned: Boolean = true): TaskRecord {
    val startTime = java.time.OffsetDateTime.now().plusHours(hoursFromNow.toLong())
    return TaskRecord(
        id = id,
        userId = 1,
        text = "Task $id",
        startTime = startTime.toString(),
        stopTime = if (isPlanned) startTime.plusHours(1).toString() else null,
        includesBreak = false,
        createdAt = startTime.toString()
    )
}

private fun sampleDashboard(accountId: Int): DashboardResponse = DashboardResponse(
    asOf = "2026-05-26T12:00:00Z",
    identity = Identity(id = accountId, username = "demo", displayName = "Demo User", isAdmin = false),
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
