package com.worktime.android.core.notifications

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.worktime.android.MainActivity
import com.worktime.android.R

const val CHANNEL_SHIFTS = "shifts"
const val CHANNEL_TIME_TRACKING = "time_tracking"
const val CHANNEL_SYNC_CONFLICTS = "sync_conflicts"

class WorktimeNotifications(private val context: Context) {
    fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channels = listOf(
            NotificationChannel(CHANNEL_SHIFTS, "Shifts", NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(CHANNEL_TIME_TRACKING, "Time tracking", NotificationManager.IMPORTANCE_DEFAULT),
            NotificationChannel(CHANNEL_SYNC_CONFLICTS, "Sync/conflicts", NotificationManager.IMPORTANCE_DEFAULT),
        )
        manager.createNotificationChannels(channels)
    }

    fun showShiftReminder(message: String) {
        show(
            id = 1001,
            channelId = CHANNEL_SHIFTS,
            title = "Shift reminder",
            message = message,
            destination = "today",
        )
    }

    fun showStaleTimer(message: String) {
        show(
            id = 1002,
            channelId = CHANNEL_TIME_TRACKING,
            title = "Running timer reminder",
            message = message,
            destination = "today",
        )
    }

    fun showSyncStatus(message: String) {
        show(
            id = 1003,
            channelId = CHANNEL_SYNC_CONFLICTS,
            title = "Sync status",
            message = message,
            destination = "today",
        )
    }

    private fun show(
        id: Int,
        channelId: String,
        title: String,
        message: String,
        destination: String,
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            putExtra(EXTRA_DESTINATION, destination)
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            id,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(id, notification)
    }

    companion object {
        const val EXTRA_DESTINATION = "destination"
    }
}
