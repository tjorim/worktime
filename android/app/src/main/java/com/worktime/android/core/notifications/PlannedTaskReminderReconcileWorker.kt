package com.worktime.android.core.notifications

import android.content.Context
import android.content.pm.ServiceInfo
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.worktime.android.app.WorktimeAndroidApplication
import kotlinx.coroutines.flow.first

/**
 * Runs [reconcilePlannedTaskReminder] on a WorkManager-managed background thread rather than
 * inline inside [WorktimeFirebaseMessagingService.onMessageReceived], which per Firebase's own
 * guidance has only a short (roughly 10-20s) execution window before the OS may reclaim the
 * process. Enqueued with `setExpedited`, this takes advantage of the brief quota exemption
 * WorkManager grants for work triggered by a high-priority FCM message (see
 * `AndroidConfig.priority("high")` in the backend's `fcm_service.py`), so it isn't starved behind
 * other background work. See #1225.
 */
class PlannedTaskReminderReconcileWorker(appContext: Context, params: WorkerParameters) :
    CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as? WorktimeAndroidApplication)?.container ?: return Result.failure()
        val succeeded =
            runCatching {
                val preferences = container.notificationPreferencesStore.preferences.first()
                reconcilePlannedTaskReminder(
                    repository = container.dashboardRepository,
                    reminderScheduler = ReminderScheduler(applicationContext),
                    plannedTasksEnabled = preferences.plannedTasksEnabled,
                    timersEnabled = preferences.timeTrackingEnabled
                )
            }.onFailure { Log.w(TAG, "Wake-ping reconcile failed (non-fatal)", it) }.getOrDefault(false)
        return if (succeeded) Result.success() else Result.failure()
    }

    // Below Android S, WorkManager runs expedited work as a foreground service, which crashes at
    // startForeground() if this channel doesn't exist yet -- createChannels() is otherwise only
    // called from MainActivity.onCreate(), which a background FCM wake may never have triggered
    // (e.g. right after a fresh install). createNotificationChannels() is idempotent, so calling
    // it again here is safe.
    override suspend fun getForegroundInfo(): ForegroundInfo {
        WorktimeNotifications(applicationContext).createChannels()
        val notification =
            NotificationCompat
                .Builder(applicationContext, CHANNEL_BACKGROUND_SYNC)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Syncing reminders")
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setOngoing(true)
                .build()
        return ForegroundInfo(
            NOTIFICATION_ID_BACKGROUND_SYNC,
            notification,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        )
    }

    companion object {
        const val WORK_NAME = "planned_task_reminder_reconcile"
        private const val TAG = "PlannedTaskReconcileWorker"
        private const val NOTIFICATION_ID_BACKGROUND_SYNC = 1004
    }
}
