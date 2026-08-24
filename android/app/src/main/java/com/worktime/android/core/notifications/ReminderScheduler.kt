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
            val account = store.getInt(KEY_ACCOUNT, INVALID_ID)
            if (account < MIN_VALID_ID) {
                cancel(type)
                return@forEach
            }
            when (type) {
                TYPE_SHIFT -> restoreShift(account)
                TYPE_TIMER -> tryRestoreFromStore(account, type)
                else -> tryRestoreFromStore(account, type)
            }
        }
    }

    private fun restoreShift(account: Int) {
        val date = store.getString("${TYPE_SHIFT}_date", null)
        val hourStr = store.getString("${TYPE_SHIFT}_hour", null)
        if (date != null && hourStr != null) {
            val hour = hourStr.toDoubleOrNull() ?: run {
                cancel(TYPE_SHIFT)
                return
            }
            val hours = hour.toInt()
            val minutes = ((hour - hours) * MINUTES_PER_HOUR).toInt()
            val start = java.time.LocalDate.parse(date)
                .atTime(hours, minutes)
                .atZone(ZoneId.systemDefault())
            val at = start.minusMinutes(SHIFT_LEAD_MINUTES).toInstant().toEpochMilli()
            val message = store.getString("${TYPE_SHIFT}_message", null)
            if (at > System.currentTimeMillis() && message != null) {
                set(TYPE_SHIFT, at, account, message)
            } else {
                cancel(TYPE_SHIFT)
            }
        } else {
            val at = store.getLong("${TYPE_SHIFT}_at", INVALID_ID.toLong())
            val message = store.getString("${TYPE_SHIFT}_message", null)
            if (at > System.currentTimeMillis() && message != null) {
                set(TYPE_SHIFT, at, account, message)
            } else {
                cancel(TYPE_SHIFT)
            }
        }
    }

    private fun tryRestoreFromStore(account: Int, type: String) {
        val at = store.getLong("${type}_at", INVALID_ID.toLong())
        val message = store.getString("${type}_message", null)
        if (at > System.currentTimeMillis() && message != null) {
            set(type, at, account, message)
        } else {
            cancel(type)
        }
    }

    private fun scheduleShift(accountId: Int, shift: NextShiftItem) {
        val hour = shift.shift.startHour ?: return cancel(TYPE_SHIFT)
        val hours = hour.toInt()
        val minutes = ((hour - hours) * MINUTES_PER_HOUR).toInt()
        val start = shift.date.let(java.time.LocalDate::parse)
            .atTime(hours, minutes)
            .atZone(ZoneId.systemDefault())
        val at = start.minusMinutes(SHIFT_LEAD_MINUTES).toInstant().toEpochMilli()
        if (start.toInstant().toEpochMilli() <= System.currentTimeMillis()) return cancel(TYPE_SHIFT)
        persistAndSet(
            TYPE_SHIFT,
            at,
            accountId,
            "${shift.shift.displayCode} starts at ${start.toLocalTime()}",
            shift.date,
            hour
        )
    }

    private fun scheduleTimer(accountId: Int, task: TaskRecord) {
        val at =
            runCatching {
                OffsetDateTime.parse(task.startTime).plusHours(STALE_HOURS).toInstant().toEpochMilli()
            }.getOrNull() ?: return cancel(TYPE_TIMER)
        persistAndSet(
            TYPE_TIMER,
            at,
            accountId,
            "Timer running for ${task.text} appears stale",
            null,
            null,
            task.id
        )
    }

    private fun persistAndSet(
        type: String,
        at: Long,
        account: Int,
        message: String,
        shiftDate: String? = null,
        shiftStartHour: Double? = null,
        taskId: String? = null
    ) {
        val identityChanged = when (type) {
            TYPE_SHIFT -> {
                val storedDate = store.getString("${type}_date", null)
                val storedHour = store.getString("${type}_hour", null)
                shiftDate != storedDate || shiftStartHour?.toString() != storedHour
            }
            TYPE_TIMER -> {
                val storedTaskId = store.getString("${type}_task_id", null)
                taskId != storedTaskId
            }
            else -> false
        }
        val storedAt = store.getLong("${type}_at", INVALID_ID.toLong())
        val storedMessage = store.getString("${type}_message", null)
        if (!identityChanged && storedAt == at && storedMessage == message) return
        store.edit().apply {
            putLong("${type}_at", at)
            putString("${type}_message", message)
            if (shiftDate != null) putString("${type}_date", shiftDate)
            if (shiftStartHour != null) putString("${type}_hour", shiftStartHour.toString())
            if (taskId != null) putString("${type}_task_id", taskId)
            apply()
        }
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
        alarms?.cancel(pendingIntent(type, INVALID_ACCOUNT_SENTINEL, ""))
        store.edit().apply {
            remove("${type}_at")
            remove("${type}_message")
            if (type == TYPE_SHIFT) {
                remove("${type}_date")
                remove("${type}_hour")
            } else if (type == TYPE_TIMER) {
                remove("${type}_task_id")
            }
            apply()
        }
    }

    private fun pendingIntent(type: String, account: Int, message: String) = PendingIntent.getBroadcast(
        context,
        if (type == TYPE_SHIFT) REQUEST_CODE_SHIFT else REQUEST_CODE_TIMER,
        Intent(context, ReminderReceiver::class.java)
            .setAction(type)
            .putExtra(EXTRA_ACCOUNT, account)
            .putExtra(EXTRA_MESSAGE, message),
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
        private const val REQUEST_CODE_SHIFT = 2001
        private const val REQUEST_CODE_TIMER = 2002
        internal const val INVALID_ACCOUNT_SENTINEL = -2
        private const val MINUTES_PER_HOUR = 60
        internal const val INVALID_ID = -1
        private const val MIN_VALID_ID = 0
    }
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val store = context.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE)
        if (intent.getIntExtra(ReminderScheduler.EXTRA_ACCOUNT, ReminderScheduler.INVALID_ID) !=
            store.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL)
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
