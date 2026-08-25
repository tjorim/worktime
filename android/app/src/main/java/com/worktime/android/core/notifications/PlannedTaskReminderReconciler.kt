package com.worktime.android.core.notifications

import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import java.time.LocalDate
import java.time.OffsetDateTime

/**
 * Fetches the current account, running task, and soonest-starting planned task, then re-arms
 * [reminderScheduler]'s local alarm via [ReminderScheduler.reconcile].
 *
 * Shared by [com.worktime.android.feature.dashboard.DashboardViewModel]'s foreground refresh
 * (indirectly, via [fetchPlannedTask]) and [WorktimeFirebaseMessagingService]'s background wake
 * (directly, since a Service has no ViewModel/Compose state to read already-fetched data from) --
 * a background wake has nothing cached to reuse, so it always fetches fresh. One shared code path
 * means both cases schedule the reminder identically. See #1205.
 *
 * Returns false without touching [reminderScheduler] when there's no session to fetch with
 * (logged out) or the fetch failed -- the caller has nothing new to reconcile with in that case.
 */
suspend fun reconcilePlannedTaskReminder(
    repository: DashboardRepository,
    reminderScheduler: ReminderScheduler,
    plannedTasksEnabled: Boolean,
    timersEnabled: Boolean
): Boolean {
    val accountId =
        when (val result = repository.loadDashboard()) {
            is DashboardLoadResult.Success -> result.dashboard.identity.id
            DashboardLoadResult.LoggedOut, is DashboardLoadResult.Error -> return false
        }
    val runningTask =
        when (val result = repository.getRunningTask()) {
            is MutationResult.Success -> result.value
            else -> null
        }
    val plannedTask = fetchPlannedTask(repository)
    reminderScheduler.reconcile(accountId, plannedTask, runningTask, plannedTasksEnabled, timersEnabled)
    return true
}

/**
 * The date range is compared against task.start_time (a UTC instant) using the device's local
 * calendar date -- padded a day on each side so a device at an extreme UTC offset (as far as
 * UTC-12 to UTC+14) can't have a soon-starting local task fall just outside the window because
 * its UTC calendar date differs from the device's local one. Extra results outside the near-term
 * window are harmless: they get filtered out by [nextPlannedTask]'s isAfter(now) check.
 */
suspend fun fetchPlannedTask(repository: DashboardRepository): TaskRecord? {
    val today = LocalDate.now()
    return when (val result = repository.listTasks(today.minusDays(1), today.plusDays(2))) {
        is MutationResult.Success -> nextPlannedTask(result.value)
        else -> null
    }
}

/**
 * Picks the soonest-starting "planned" task -- stop_time already set (not a running timer),
 * start_time still ahead of now -- to drive the local reminder alarm. Mirrors the frontend's
 * `isPlanned` check in DailyTaskList.tsx.
 */
private fun nextPlannedTask(tasks: List<TaskRecord>): TaskRecord? {
    val now = OffsetDateTime.now()
    return tasks
        .asSequence()
        .filter { it.stopTime != null }
        .mapNotNull { task -> runCatching { OffsetDateTime.parse(task.startTime) }.getOrNull()?.let { task to it } }
        .filter { (_, startTime) -> startTime.isAfter(now) }
        .minByOrNull { (_, startTime) -> startTime }
        ?.first
}
