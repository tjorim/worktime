package com.worktime.android.core.notifications

import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import java.time.LocalDate
import java.time.OffsetDateTime
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope

/**
 * Fetches the current account, running task, and soonest-starting planned task, then re-arms
 * [reminderScheduler]'s local alarm via [ReminderScheduler.reconcile].
 *
 * Shared by [com.worktime.android.feature.dashboard.DashboardViewModel]'s foreground refresh
 * (indirectly, via [fetchPlannedTask]) and [PlannedTaskReminderReconcileWorker]'s background wake
 * (directly, since a Worker has no ViewModel/Compose state to read already-fetched data from) --
 * a background wake has nothing cached to reuse, so it always fetches fresh. One shared code path
 * means both cases schedule the reminder identically. See #1205, #1225.
 *
 * Returns false without touching [reminderScheduler] when there's no session to fetch with
 * (logged out) or either fetch failed. This must never call [ReminderScheduler.reconcile] on a
 * partial/failed read: reconcile() cancels any existing alarm for a kind it wasn't given a task
 * for, so folding a transient failure into "no task" would silently cancel an already-correctly-
 * scheduled reminder. The foreground path tolerates that (a failed refresh there is quickly
 * followed by another), but a background wake is a one-shot event with nothing to self-correct
 * it -- an alarm cancelled here stays cancelled until the app is next opened.
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

    // Run concurrently, not sequentially: a background wake (unlike the foreground path) has a
    // short execution window before the OS may reclaim the process, so halving the number of
    // network round trips on the critical path matters here.
    val (runningTaskResult, tasksResult) =
        coroutineScope {
            val runningTaskDeferred = async { repository.getRunningTask() }
            val tasksDeferred = async { listNearTermTasks(repository) }
            runningTaskDeferred.await() to tasksDeferred.await()
        }
    if (runningTaskResult !is MutationResult.Success || tasksResult !is MutationResult.Success) return false

    reminderScheduler.reconcile(
        accountId,
        nextPlannedTask(tasksResult.value),
        runningTaskResult.value,
        plannedTasksEnabled,
        timersEnabled
    )
    return true
}

/**
 * Tolerant version of the same lookup for UI display purposes (see
 * [com.worktime.android.feature.dashboard.DashboardViewModel]): a failed fetch just shows no
 * planned task rather than propagating an error, since it self-corrects on the next refresh.
 * [reconcilePlannedTaskReminder] does not use this -- see its own doc for why.
 */
suspend fun fetchPlannedTask(repository: DashboardRepository): TaskRecord? {
    val result = listNearTermTasks(repository)
    return (result as? MutationResult.Success)?.value?.let(::nextPlannedTask)
}

/**
 * The date range is compared against task.start_time (a UTC instant) using the device's local
 * calendar date -- padded a day on each side so a device at an extreme UTC offset (as far as
 * UTC-12 to UTC+14) can't have a soon-starting local task fall just outside the window because
 * its UTC calendar date differs from the device's local one. Extra results outside the near-term
 * window are harmless: they get filtered out by [nextPlannedTask]'s isAfter(now) check.
 */
private suspend fun listNearTermTasks(repository: DashboardRepository): MutationResult<List<TaskRecord>> {
    val today = LocalDate.now()
    return repository.listTasks(today.minusDays(1), today.plusDays(2))
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
