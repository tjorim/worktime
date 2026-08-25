package com.worktime.android.core.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.annotation.ChecksSdkIntAtLeast
import com.worktime.android.data.model.TaskRecord
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
        plannedTask: TaskRecord?,
        runningTask: TaskRecord?,
        plannedTasksEnabled: Boolean,
        timersEnabled: Boolean
    ) {
        if (store.getInt(KEY_ACCOUNT, INVALID_ID) != accountId) {
            cancelAll()
            store.edit().putInt(KEY_ACCOUNT, accountId).apply()
        }
        if (plannedTasksEnabled && plannedTask != null) {
            schedulePlannedTask(accountId, plannedTask)
        } else {
            cancel(TYPE_PLANNED_TASK)
        }
        if (timersEnabled && runningTask != null) scheduleTimer(accountId, runningTask) else cancel(TYPE_TIMER)
    }

    fun cancelAll() {
        cancel(TYPE_PLANNED_TASK)
        cancel(TYPE_TIMER)
        store.edit().clear().apply()
    }

    fun restore() {
        listOf(TYPE_PLANNED_TASK, TYPE_TIMER).forEach { type ->
            val account = store.getInt(KEY_ACCOUNT, INVALID_ID)
            if (account < MIN_VALID_ID) {
                cancel(type)
                return@forEach
            }
            if (type == TYPE_PLANNED_TASK) restorePlannedTask(account) else tryRestoreFromStore(account, type)
        }
    }

    private fun restorePlannedTask(account: Int) {
        val startTimeRaw = store.getString(key(TYPE_PLANNED_TASK, SUFFIX_START), null)
        val startTime = startTimeRaw?.let { runCatching { OffsetDateTime.parse(it) }.getOrNull() }
        val message = store.getString(key(TYPE_PLANNED_TASK, SUFFIX_MESSAGE), null)
        if (startTime == null) return cancel(TYPE_PLANNED_TASK)
        val at = startTime.minusMinutes(PLANNED_TASK_LEAD_MINUTES).toInstant().toEpochMilli()
        if (at > System.currentTimeMillis() && message != null) {
            set(TYPE_PLANNED_TASK, at, account, message)
        } else {
            cancel(TYPE_PLANNED_TASK)
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

    private fun schedulePlannedTask(accountId: Int, task: TaskRecord) {
        val startTime = runCatching { OffsetDateTime.parse(task.startTime) }.getOrNull()
            ?: return cancel(TYPE_PLANNED_TASK)
        if (startTime.toInstant().toEpochMilli() <= System.currentTimeMillis()) return cancel(TYPE_PLANNED_TASK)
        val at = startTime.minusMinutes(PLANNED_TASK_LEAD_MINUTES).toInstant().toEpochMilli()
        // startTime is UTC-normalized by the backend; toLocalTime() on it would report the
        // instant's UTC wall-clock time, not this device's -- convert to the device's zone
        // (same instant, different offset) before extracting the displayed time-of-day.
        val displayTime = startTime.atZoneSameInstant(ZoneId.systemDefault()).toLocalTime()
        persistAndSet(
            TYPE_PLANNED_TASK,
            at,
            accountId,
            "${task.text} starts at $displayTime",
            taskId = task.id,
            startTimeRaw = task.startTime
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
            taskId = task.id
        )
    }

    private fun persistAndSet(
        type: String,
        at: Long,
        account: Int,
        message: String,
        taskId: String? = null,
        startTimeRaw: String? = null
    ) {
        val storedTaskId = store.getString(key(type, SUFFIX_TASK_ID), null)
        val identityChanged = taskId != storedTaskId
        val storedAt = store.getLong(key(type, SUFFIX_AT), INVALID_ID.toLong())
        val storedMessage = store.getString(key(type, SUFFIX_MESSAGE), null)
        if (!identityChanged && storedAt == at && storedMessage == message) return
        store.edit().apply {
            putLong(key(type, SUFFIX_AT), at)
            putString(key(type, SUFFIX_MESSAGE), message)
            if (taskId != null) putString(key(type, SUFFIX_TASK_ID), taskId)
            if (startTimeRaw != null) putString(key(type, SUFFIX_START), startTimeRaw)
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
            remove(key(type, SUFFIX_TASK_ID))
            if (type == TYPE_PLANNED_TASK) remove(key(type, SUFFIX_START))
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
            if (type == TYPE_PLANNED_TASK) REQUEST_CODE_PLANNED_TASK else REQUEST_CODE_TIMER,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    companion object {
        internal const val STORE = "scheduled_reminders"
        internal const val KEY_ACCOUNT = "account"
        internal const val EXTRA_ACCOUNT = "account"
        internal const val EXTRA_MESSAGE = "message"
        internal const val TYPE_PLANNED_TASK = "com.worktime.reminder.PLANNED_TASK"
        internal const val TYPE_TIMER = "com.worktime.reminder.TIMER"
        const val PLANNED_TASK_LEAD_MINUTES = 10L
        const val STALE_HOURS = 8L
        private const val MIN_SCHEDULE_DELAY_MILLIS = 1_000L
        private const val REQUEST_CODE_PLANNED_TASK = 2001
        private const val REQUEST_CODE_TIMER = 2002
        internal const val INVALID_ACCOUNT_SENTINEL = -2
        internal const val INVALID_ID = -1
        private const val MIN_VALID_ID = 0
    }
}

private const val SUFFIX_AT = "at"
private const val SUFFIX_MESSAGE = "message"
private const val SUFFIX_START = "start"
private const val SUFFIX_TASK_ID = "task_id"

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
            ReminderScheduler.TYPE_PLANNED_TASK -> notifications.showPlannedTaskReminder(message)
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
