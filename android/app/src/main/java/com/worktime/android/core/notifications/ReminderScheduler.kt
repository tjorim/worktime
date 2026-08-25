package com.worktime.android.core.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.annotation.ChecksSdkIntAtLeast
import com.worktime.android.data.model.NextShiftItem
import com.worktime.android.data.model.TaskRecord
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneId

/** Persists and schedules the one next reminder of each kind, independently of the UI process. */
class ReminderScheduler(private val context: Context) {
    private val alarms = context.getSystemService(AlarmManager::class.java)
    private val store = context.getSharedPreferences(STORE, Context.MODE_PRIVATE)

    // Overridable seam for tests: Build.VERSION.SDK_INT can't be reflectively overridden on
    // modern JDKs (it's a static final field), so this is the only way to exercise the
    // pre-S exact-alarm-permission branch below without Robolectric.
    internal var sdkInt: Int = Build.VERSION.SDK_INT

    fun reconcile(
        accountId: Int,
        shift: NextShiftItem?,
        runningTask: TaskRecord?,
        shiftsEnabled: Boolean,
        timersEnabled: Boolean
    ) {
        if (store.getInt(KEY_ACCOUNT, INVALID_ID) != accountId) {
            cancelAll()
            store.edit().putInt(KEY_ACCOUNT, accountId).apply()
        }
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
            if (type == TYPE_SHIFT) restoreShift(account) else tryRestoreFromStore(account, type)
        }
    }

    private fun restoreShift(account: Int) {
        val date = store.getString(key(TYPE_SHIFT, SUFFIX_DATE), null)
        val hour = store.getString(key(TYPE_SHIFT, SUFFIX_HOUR), null)?.toDoubleOrNull()
        if (date == null || hour == null) return cancel(TYPE_SHIFT)
        val start = LocalDate.parse(date)
            .atTime(fractionalHourToLocalTime(hour))
            .atZone(ZoneId.systemDefault())
        val at = start.minusMinutes(SHIFT_LEAD_MINUTES).toInstant().toEpochMilli()
        val message = store.getString(key(TYPE_SHIFT, SUFFIX_MESSAGE), null)
        if (at > System.currentTimeMillis() && message != null) {
            set(TYPE_SHIFT, at, account, message)
        } else {
            cancel(TYPE_SHIFT)
        }
    }

    private fun tryRestoreFromStore(account: Int, type: String) {
        val at = store.getLong(key(type, SUFFIX_AT), INVALID_ID.toLong())
        val message = store.getString(key(type, SUFFIX_MESSAGE), null)
        if (at > System.currentTimeMillis() && message != null) {
            set(type, at, account, message)
        } else {
            cancel(type)
        }
    }

    private fun scheduleShift(accountId: Int, shift: NextShiftItem) {
        val hour = shift.shift.startHour ?: return cancel(TYPE_SHIFT)
        val start = LocalDate.parse(shift.date)
            .atTime(fractionalHourToLocalTime(hour))
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
                val storedDate = store.getString(key(type, SUFFIX_DATE), null)
                val storedHour = store.getString(key(type, SUFFIX_HOUR), null)
                shiftDate != storedDate || shiftStartHour?.toString() != storedHour
            }
            TYPE_TIMER -> {
                val storedTaskId = store.getString(key(type, SUFFIX_TASK_ID), null)
                taskId != storedTaskId
            }
            else -> false
        }
        val storedAt = store.getLong(key(type, SUFFIX_AT), INVALID_ID.toLong())
        val storedMessage = store.getString(key(type, SUFFIX_MESSAGE), null)
        if (!identityChanged && storedAt == at && storedMessage == message) return
        store.edit().apply {
            putLong(key(type, SUFFIX_AT), at)
            putString(key(type, SUFFIX_MESSAGE), message)
            if (shiftDate != null) putString(key(type, SUFFIX_DATE), shiftDate)
            if (shiftStartHour != null) putString(key(type, SUFFIX_HOUR), shiftStartHour.toString())
            if (taskId != null) putString(key(type, SUFFIX_TASK_ID), taskId)
            apply()
        }
        set(type, at, account, message)
    }

    private fun set(type: String, at: Long, account: Int, message: String) {
        val operation = pendingIntent(type, account, message)
        // Clamp to a minimum future delay: a past-due `at` (e.g. a timer already stale by the
        // time this device reconciles) would otherwise hand AlarmManager a past timestamp, which
        // aggressive OEM battery management can defer or drop instead of firing immediately.
        val triggerAt = maxOf(at, System.currentTimeMillis() + MIN_SCHEDULE_DELAY_MILLIS)
        val exactAlarmAvailable =
            !isAtLeastS(sdkInt) || alarms?.canScheduleExactAlarms() == true
        if (exactAlarmAvailable) {
            alarms?.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        } else {
            // Permission denial degrades to an inexact, battery-friendly alarm rather than losing the reminder.
            alarms?.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, operation)
        }
    }

    private fun cancel(type: String) {
        alarms?.cancel(pendingIntent(type, INVALID_ACCOUNT_SENTINEL, ""))
        store.edit().apply {
            remove(key(type, SUFFIX_AT))
            remove(key(type, SUFFIX_MESSAGE))
            if (type == TYPE_SHIFT) {
                remove(key(type, SUFFIX_DATE))
                remove(key(type, SUFFIX_HOUR))
            } else if (type == TYPE_TIMER) {
                remove(key(type, SUFFIX_TASK_ID))
            }
            apply()
        }
    }

    private fun pendingIntent(type: String, account: Int, message: String): PendingIntent {
        // Statements, not a fluent chain: Intent's setters return Intent for chaining on a real
        // device, but under this module's non-Robolectric unit-test stubs those calls return
        // null, so chaining them would NPE in tests.
        val intent = Intent(context, ReminderReceiver::class.java)
        intent.action = type
        intent.putExtra(EXTRA_ACCOUNT, account)
        intent.putExtra(EXTRA_MESSAGE, message)
        return PendingIntent.getBroadcast(
            context,
            if (type == TYPE_SHIFT) REQUEST_CODE_SHIFT else REQUEST_CODE_TIMER,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

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
        internal const val INVALID_ID = -1
        private const val MIN_VALID_ID = 0
    }
}

private const val MINUTES_PER_HOUR = 60
private const val SUFFIX_AT = "at"
private const val SUFFIX_MESSAGE = "message"
private const val SUFFIX_DATE = "date"
private const val SUFFIX_HOUR = "hour"
private const val SUFFIX_TASK_ID = "task_id"

// Shared by scheduling and restore so the two can never compute a different alarm time for the
// same stored shift.
private fun fractionalHourToLocalTime(hour: Double): LocalTime {
    val hours = hour.toInt()
    val minutes = ((hour - hours) * MINUTES_PER_HOUR).toInt()
    return LocalTime.of(hours, minutes)
}

// Single source of truth for the per-type key format, so a typo can't silently desync a write
// path from a read/cancel path.
private fun key(type: String, suffix: String) = "${type}_$suffix"

// Annotated so Android Lint's NewApi check still recognizes this as a valid version guard for
// canScheduleExactAlarms() (API 31), even though it checks the testable `sdkInt` seam above
// rather than the literal Build.VERSION.SDK_INT it normally pattern-matches on.
@ChecksSdkIntAtLeast(api = Build.VERSION_CODES.S)
private fun isAtLeastS(sdkInt: Int) = sdkInt >= Build.VERSION_CODES.S

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
