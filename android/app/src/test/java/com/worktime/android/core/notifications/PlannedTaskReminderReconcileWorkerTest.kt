package com.worktime.android.core.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.SharedPreferences
import androidx.work.ListenableWorker
import androidx.work.WorkerParameters
import androidx.work.testing.TestListenableWorkerBuilder
import com.worktime.android.app.WorktimeAndroidApplication
import com.worktime.android.app.WorktimeAppContainer
import com.worktime.android.core.storage.NotificationPreferences
import com.worktime.android.core.storage.NotificationPreferencesStore
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.MutationResult
import com.worktime.android.data.repository.WorktimeRepository
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test

class PlannedTaskReminderReconcileWorkerTest {
    @Before
    fun setUp() {
        // ReminderScheduler is constructed for real inside doWork() (see buildWorker below);
        // its pendingIntent() helper calls this real static method, which under this module's
        // non-Robolectric unit-test stubs returns null and NPEs on the non-null return type.
        mockkStatic(PendingIntent::class)
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun `doWork fails without touching the repository when applicationContext isn't the app class`() = runTest {
        val context = mockk<Context>(relaxed = true)
        val params = mockk<WorkerParameters>(relaxed = true)
        val worker = PlannedTaskReminderReconcileWorker(context, params)

        val result = worker.doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
    }

    @Test
    fun `doWork fails without scheduling when logged out`() = runTest {
        val repository = mockk<WorktimeRepository>()
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.LoggedOut
        val worker =
            buildWorker(repository, NotificationPreferences(plannedTasksEnabled = true, timeTrackingEnabled = true))

        val result = worker.doWork()

        assertEquals(ListenableWorker.Result.failure(), result)
        coVerify(exactly = 0) { repository.getRunningTask() }
    }

    @Test
    fun `doWork succeeds when the reconcile fetch succeeds`() = runTest {
        val repository = mockk<WorktimeRepository>()
        coEvery { repository.loadDashboard() } returns DashboardLoadResult.Success(sampleDashboard())
        coEvery { repository.getRunningTask() } returns MutationResult.Success(null)
        coEvery { repository.listTasks(any(), any()) } returns MutationResult.Success(emptyList())
        val worker =
            buildWorker(repository, NotificationPreferences(plannedTasksEnabled = true, timeTrackingEnabled = true))

        val result = worker.doWork()

        assertEquals(ListenableWorker.Result.success(), result)
    }

    // Exercises the androidx.work:work-testing builder path in addition to the direct
    // constructor calls above, so a future WorkManager upgrade that breaks worker construction
    // (e.g. via WorkerFactory/WorkerParameters wiring) fails here too.
    @Test
    fun `TestListenableWorkerBuilder can construct the worker`() {
        val worker = TestListenableWorkerBuilder<PlannedTaskReminderReconcileWorker>(mockk(relaxed = true)).build()

        assertNotNull(worker)
    }

    private fun buildWorker(
        repository: WorktimeRepository,
        preferences: NotificationPreferences
    ): PlannedTaskReminderReconcileWorker {
        val preferencesStore = mockk<NotificationPreferencesStore>()
        every { preferencesStore.preferences } returns flowOf(preferences)
        val container = mockk<WorktimeAppContainer>(relaxed = true)
        every { container.notificationPreferencesStore } returns preferencesStore
        every { container.dashboardRepository } returns repository
        val app = mockk<WorktimeAndroidApplication>(relaxed = true)
        every { app.container } returns container
        // ReminderScheduler(applicationContext) is constructed eagerly as a reconcile argument
        // regardless of which branch runs; a relaxed mock can't infer AlarmManager as the return
        // type of the generic getSystemService(Class<T>) overload (it erases to Object and
        // ClassCastExceptions on the assignment), so it needs an explicit stub here.
        every { app.getSystemService(AlarmManager::class.java) } returns mockk<AlarmManager>(relaxed = true)
        every { app.getSharedPreferences(any(), any()) } returns mockk<SharedPreferences>(relaxed = true)
        val params = mockk<WorkerParameters>(relaxed = true)
        return PlannedTaskReminderReconcileWorker(app, params)
    }
}

private fun sampleDashboard(): DashboardResponse = DashboardResponse(
    asOf = "2026-05-26T12:00:00Z",
    identity = Identity(id = 7, username = "demo", displayName = "Demo User", isAdmin = false),
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
