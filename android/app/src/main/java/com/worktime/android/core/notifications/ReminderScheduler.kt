package com.worktime.android.core.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import com.worktime.android.data.model.NextShiftItem
import com.worktime.android.data.model.TaskRecord
import java.time.OffsetDateTime
import java.time.ZoneId

/** Persists and schedules the one next reminder of each kind, independently of the UI process. */
class ReminderScheduler(private val context: Context) {
    private val alarms = context.getSystemService(AlarmManager::class.java)
    private val store = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    fun reconcile(
        accountId: Int,
        shift: NextShiftItem?,
        runningTask: TaskRecord?,
        shiftsEnabled: Boolean,
        timersEnabled: Boolean
    ) {
        if (store.getInt(KEY_ACCOUNT, accountId) != accountId) cancelAll()
        store.edit().putInt(KEY_ACCOUNT, accountId).apply()
        if (shiftsEnabled && shift != null) scheduleShift(accountId, shift) else cancel(TYPE_SHIFT)
        if (timersEnabled && runningTask != null) scheduleTimer(accountId, runningTask) else cancel(TYPE_TIMER)
    }

    fun cancelAll() {
        cancel(TYPE_SHIFT)
        cancel(TYPE_TIMER)
        store.edit().clear().apply()
    }

    fun restore() {
        listOf(TYPE_SHIFT, TYPE_TIMER).forEach { type ->
            val at = store.getLong("${type}_at", -1)
            val account = store.getInt(KEY_ACCOUNT, -1)
            val message = store.getString("${type}_message", null)
            if (at > System.currentTimeMillis() && account >= 0 && message != null) {
                set(type, at, account, message)
            } else {
                cancel(type)
            }
        }
    }

    private fun scheduleShift(accountId: Int, shift: NextShiftItem) {
        val hour = shift.shift.startHour ?: return cancel(TYPE_SHIFT)
        val hours = hour.toInt()
        val minutes = ((hour - hours) * 60).toInt()
        val start = shift.date.let(java.time.LocalDate::parse).atTime(hours, minutes).atZone(ZoneId.systemDefault())
        val at = start.minusMinutes(SHIFT_LEAD_MINUTES).toInstant().toEpochMilli()
        if (start.toInstant().toEpochMilli() <= System.currentTimeMillis()) return cancel(TYPE_SHIFT)
        persistAndSet(
            TYPE_SHIFT,
            maxOf(at, System.currentTimeMillis() + MIN_SCHEDULE_DELAY_MILLIS),
            accountId,
            "${shift.shift.displayCode} starts at ${start.toLocalTime()}"
        )
    }

    private fun scheduleTimer(accountId: Int, task: TaskRecord) {
        val at =
            runCatching {
                OffsetDateTime.parse(task.startTime).plusHours(STALE_HOURS).toInstant().toEpochMilli()
            }.getOrNull() ?: return cancel(TYPE_TIMER)
        persistAndSet(
            TYPE_TIMER,
            maxOf(at, System.currentTimeMillis() + MIN_SCHEDULE_DELAY_MILLIS),
            accountId,
            "Timer running for ${task.text} appears stale"
        )
    }

    private fun persistAndSet(type: String, at: Long, account: Int, message: String) {
        if (store.getLong("${type}_at", -1) == at && store.getString("${type}_message", null) == message) return
        store.edit().putLong("${type}_at", at).putString("${type}_message", message).apply()
        set(type, at, account, message)
    }

    private fun set(type: String, at: Long, account: Int, message: String) {
        val operation = pendingIntent(type, account, message)
        val exactAlarmAvailable =
            Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms?.canScheduleExactAlarms() == true
        if (exactAlarmAvailable) {
            alarms?.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
        } else {
            // Permission denial degrades to an inexact, battery-friendly alarm rather than losing the reminder.
            alarms?.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
        }
    }

    private fun cancel(type: String) {
        alarms?.cancel(pendingIntent(type, 0, ""))
        store.edit().remove("${type}_at").remove("${type}_message").apply()
    }

    private fun pendingIntent(type: String, account: Int, message: String) =
        PendingIntent.getBroadcast(
            context,
            if (type == TYPE_SHIFT) 2001 else 2002,
            Intent(context, ReminderReceiver::class.java).setAction(type)
                .putExtra(EXTRA_ACCOUNT, account).putExtra(EXTRA_MESSAGE, message),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

    companion object {
        internal const val STORE = "scheduled_reminders"
        internal const val KEY_ACCOUNT = "account"
        internal const val EXTRA_ACCOUNT = "account"
        internal const val EXTRA_MESSAGE = "message"
        internal const val TYPE_SHIFT = "com.worktime.reminder.SHIFT"
        internal const val TYPE_TIMER = "com.worktime.reminder.TIMER"
        const val SHIFT_LEAD_MINUTES = 30L
        const val STALE_HOURS = 8L
        private const val MIN_SCHEDULE_DELAY_MILLIS = 1_000L
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = context.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE)
        if (intent.getIntExtra(ReminderScheduler.EXTRA_ACCOUNT, -1) !=
            store.getInt(ReminderScheduler.KEY_ACCOUNT, -2)
        ) {
            return
        }
        val message = intent.getStringExtra(ReminderScheduler.EXTRA_MESSAGE) ?: return
        val notifications = WorktimeNotifications(context)
        when (intent.action) {
            ReminderScheduler.TYPE_SHIFT -> notifications.showShiftReminder(message)
            ReminderScheduler.TYPE_TIMER -> notifications.showStaleTimer(message)
        }
    }
}

class ReminderRestoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action in RESTORE_ACTIONS) ReminderScheduler(context).restore()
    }

    companion object {
        private val RESTORE_ACTIONS =
            setOf(
                Intent.ACTION_BOOT_COMPLETED,
                Intent.ACTION_TIME_CHANGED,
                Intent.ACTION_TIMEZONE_CHANGED
            )
    }
}
