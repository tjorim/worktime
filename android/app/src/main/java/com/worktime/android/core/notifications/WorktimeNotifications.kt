package com.worktime.android.core.notifications

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.worktime.android.MainActivity

const val CHANNEL_PLANNED_TASKS = "planned_tasks"
const val CHANNEL_TIME_TRACKING = "time_tracking"
const val CHANNEL_SYNC_CONFLICTS = "sync_conflicts"

// IMPORTANCE_MIN (not one of the user-facing channels above): this exists only to satisfy the
// foreground-service notification WorkManager requires for expedited work below Android S -- see
// PlannedTaskReminderReconcileWorker (#1225) -- not to alert the user to anything.
const val CHANNEL_BACKGROUND_SYNC = "background_sync"

class WorktimeNotifications(private val context: Context) {
    fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channels =
            listOf(
                privateChannel(CHANNEL_PLANNED_TASKS, "Planned tasks"),
                privateChannel(CHANNEL_TIME_TRACKING, "Time tracking"),
                privateChannel(CHANNEL_SYNC_CONFLICTS, "Sync/conflicts"),
                NotificationChannel(CHANNEL_BACKGROUND_SYNC, "Background sync", NotificationManager.IMPORTANCE_MIN)
            )
        manager.createNotificationChannels(channels)
    }

    /**
     * Removes the reminders this app has posted. Called on sign-out so task names don't outlive the
     * session in the shade. Cancels by id rather than `cancelAll()` so the WorkManager foreground
     * notification used by the background reconcile isn't torn down underneath it.
     */
    fun cancelAll() {
        val manager = NotificationManagerCompat.from(context)
        REMINDER_NOTIFICATION_IDS.forEach(manager::cancel)
    }

    fun showPlannedTaskReminder(message: String) {
        show(
            id = NOTIFICATION_ID_PLANNED_TASK_REMINDER,
            channelId = CHANNEL_PLANNED_TASKS,
            title = "Starting soon",
            message = message,
            destination = "today",
            publicText = PUBLIC_TEXT_PLANNED_TASK
        )
    }

    fun showStaleTimer(message: String) {
        show(
            id = NOTIFICATION_ID_TIMER_REMINDER,
            channelId = CHANNEL_TIME_TRACKING,
            title = "Running timer reminder",
            message = message,
            destination = "today",
            publicText = PUBLIC_TEXT_TIMER
        )
    }

    fun showSyncStatus(message: String) {
        show(
            id = NOTIFICATION_ID_SYNC_STATUS,
            channelId = CHANNEL_SYNC_CONFLICTS,
            title = "Sync status",
            message = message,
            destination = "today",
            publicText = PUBLIC_TEXT_SYNC_STATUS
        )
    }

    @Suppress("LongParameterList")
    private fun show(
        id: Int,
        channelId: String,
        title: String,
        message: String,
        destination: String,
        publicText: String
    ) {
        // Statements, not a fluent chain: under the non-Robolectric unit-test stubs Intent's
        // setters return null, which would NPE (see WorktimeNotificationsTest).
        // The tap always opens MainActivity, so the session and app-lock gates run before any content.
        val intent = Intent(context, MainActivity::class.java)
        intent.setPackage(context.packageName)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        intent.putExtra(EXTRA_DESTINATION, destination)
        val pendingIntent =
            PendingIntent.getActivity(
                context,
                id,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        // Task names are personal, so while the device is locked the shade shows only this generic
        // version; the full text appears once the user unlocks.
        val publicVersion =
            NotificationCompat
                .Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(PUBLIC_TITLE)
                .setContentText(publicText)
                .build()
        val notification =
            NotificationCompat
                .Builder(context, channelId)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle(title)
                .setContentText(message)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(publicVersion)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()
        val canNotify =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
                ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
                PackageManager.PERMISSION_GRANTED
        if (canNotify) {
            NotificationManagerCompat.from(context).notify(id, notification)
        }
    }

    private fun privateChannel(id: String, name: String): NotificationChannel =
        NotificationChannel(id, name, NotificationManager.IMPORTANCE_DEFAULT).apply {
            lockscreenVisibility = Notification.VISIBILITY_PRIVATE
        }

    companion object {
        const val EXTRA_DESTINATION = "destination"
        internal const val PUBLIC_TITLE = "Worktime"
        internal const val PUBLIC_TEXT_PLANNED_TASK = "A planned task starts soon"
        internal const val PUBLIC_TEXT_TIMER = "A running timer needs your attention"
        internal const val PUBLIC_TEXT_SYNC_STATUS = "Sync status updated"
        private const val NOTIFICATION_ID_PLANNED_TASK_REMINDER = 1001
        private const val NOTIFICATION_ID_TIMER_REMINDER = 1002
        private const val NOTIFICATION_ID_SYNC_STATUS = 1003
        internal val REMINDER_NOTIFICATION_IDS =
            listOf(NOTIFICATION_ID_PLANNED_TASK_REMINDER, NOTIFICATION_ID_TIMER_REMINDER, NOTIFICATION_ID_SYNC_STATUS)
    }
}
