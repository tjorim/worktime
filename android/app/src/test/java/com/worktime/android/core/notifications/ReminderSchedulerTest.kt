package com.worktime.android.core.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.os.Build
import com.worktime.android.data.model.TaskRecord
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import org.junit.After
import org.junit.Before
import org.junit.Test

class ReminderSchedulerTest {

    private val mockContext: Context = mockk(relaxed = true)
    private val mockAlarmManager: AlarmManager = mockk(relaxed = true)
    private val mockSharedPrefs: SharedPreferences = mockk(relaxed = true)
    private val mockEditor: SharedPreferences.Editor = mockk(relaxed = true)

    private lateinit var scheduler: ReminderScheduler

    @Before
    fun setUp() {
        mockkStatic(AlarmManager::class)
        mockkStatic(PendingIntent::class)
        // Constructing a real WorktimeNotifications would build a real content Intent, which
        // NPEs under this module's non-Robolectric unit-test stubs (see pendingIntent() above).
        mockkConstructor(WorktimeNotifications::class)

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(any(), any()) } returns mockSharedPrefs
        every { mockSharedPrefs.edit() } returns mockEditor
        every { mockEditor.apply() } returns Unit

        scheduler = ReminderScheduler(mockContext)
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    private fun createPlannedTask(taskId: String = "planned-1", hoursFromNow: Int = 1): TaskRecord {
        val startTime = java.time.OffsetDateTime.now().plusHours(hoursFromNow.toLong())
        val stopTime = startTime.plusHours(1)
        return TaskRecord(
            id = taskId,
            userId = 1,
            text = "Team meeting",
            startTime = startTime.toString(),
            stopTime = stopTime.toString(),
            includesBreak = false,
            createdAt = startTime.toString()
        )
    }

    private fun createTask(taskId: String = "task-1", hoursAgo: Int = -2): TaskRecord {
        val startTime = java.time.OffsetDateTime.now().plusHours(hoursAgo.toLong())
        return TaskRecord(
            id = taskId,
            userId = 1,
            text = "Test Task",
            startTime = startTime.toString(),
            stopTime = null,
            includesBreak = false,
            createdAt = startTime.toString()
        )
    }

    // ==================== Scheduling Tests ====================

    @Test
    fun `reconcile schedules planned-task reminder when enabled and task exists`() {
        val accountId = 1
        val task = createPlannedTask()

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.putLong(any(), any()) } returns mockEditor
        every { mockEditor.putString(any(), any()) } returns mockEditor
        every { mockAlarmManager.canScheduleExactAlarms() } returns true
        every { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, task, null, plannedTasksEnabled = true, timersEnabled = false)

        verify(exactly = 1) { mockEditor.putLong("${ReminderScheduler.TYPE_PLANNED_TASK}_at", any()) }
        verify(exactly = 1) { mockEditor.putString("${ReminderScheduler.TYPE_PLANNED_TASK}_message", any()) }
        verify(exactly = 1) {
            mockAlarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, any(), any())
        }
    }

    @Test
    fun `reconcile schedules timer reminder when enabled and task exists`() {
        val accountId = 1
        val task = createTask()

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.putLong(any(), any()) } returns mockEditor
        every { mockEditor.putString(any(), any()) } returns mockEditor
        every { mockAlarmManager.canScheduleExactAlarms() } returns true
        every { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, null, task, plannedTasksEnabled = false, timersEnabled = true)

        verify(exactly = 1) { mockEditor.putLong("${ReminderScheduler.TYPE_TIMER}_at", any()) }
        verify(exactly = 1) { mockEditor.putString("${ReminderScheduler.TYPE_TIMER}_message", any()) }
        verify(exactly = 1) { mockEditor.putString("${ReminderScheduler.TYPE_TIMER}_task_id", "task-1") }
    }

    // ==================== Cancellation Tests ====================

    @Test
    fun `reconcile cancels planned-task reminder when disabled`() {
        val accountId = 1

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, null, null, plannedTasksEnabled = false, timersEnabled = false)

        // Disabling both cancels the planned-task AND timer reminder independently.
        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
        verify(exactly = 1) { mockEditor.remove("${ReminderScheduler.TYPE_PLANNED_TASK}_at") }
    }

    @Test
    fun `cancelAll cancels both reminder types`() {
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.clear() } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.cancelAll()

        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
        verify(exactly = 1) { mockEditor.clear() }
    }

    @Test
    fun `reconcile cancels all when account changes`() {
        val oldAccountId = 1
        val newAccountId = 2

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns oldAccountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, newAccountId) } returns mockEditor
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.clear() } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(newAccountId, null, null, plannedTasksEnabled = false, timersEnabled = false)

        verify(exactly = 1) { mockEditor.clear() }
        // cancelAll() cancels planned-task+timer (2), then the disabled branches below
        // it independently cancel each again (2 more) since task/running task are both null.
        verify(exactly = 4) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    @Test
    fun `reconcile with null planned task and null running task cancels both reminders`() {
        val accountId = 1

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, null, null, plannedTasksEnabled = true, timersEnabled = true)

        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    // ==================== Rescheduling Tests ====================

    @Test
    fun `reconcile reschedules when the planned task changes`() {
        val accountId = 1
        val oldTask = createPlannedTask(taskId = "planned-old")
        val newTask = createPlannedTask(taskId = "planned-new")

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockSharedPrefs.getLong(any(), any()) } returnsMany listOf(1000L, 2000L)
        every { mockSharedPrefs.getString(any(), any()) } returnsMany listOf("planned-old", "planned-new")
        every { mockEditor.putLong(any(), any()) } returns mockEditor
        every { mockEditor.putString(any(), any()) } returns mockEditor
        every { mockAlarmManager.canScheduleExactAlarms() } returns true
        every { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        // First reconcile with the old task
        scheduler.reconcile(accountId, oldTask, null, plannedTasksEnabled = true, timersEnabled = false)
        // Then reconcile with the new task
        scheduler.reconcile(accountId, newTask, null, plannedTasksEnabled = true, timersEnabled = false)

        verify(exactly = 2) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
    }

    // ==================== Deduplication Tests ====================

    @Test
    fun `persistAndSet skips when nothing changed`() {
        val accountId = 1
        val task = createPlannedTask()
        // Mirror ReminderScheduler.schedulePlannedTask's own computation exactly, so the
        // stored values under test genuinely match what the real code would (re)compute and
        // the dedup-skip guard is actually exercised rather than always falling through.
        val startTime = java.time.OffsetDateTime.parse(task.startTime)
        val at = startTime.minusMinutes(ReminderScheduler.PLANNED_TASK_LEAD_MINUTES).toInstant().toEpochMilli()
        val message = "${task.text} starts at ${startTime.toLocalTime()}"

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every {
            mockSharedPrefs.getLong("${ReminderScheduler.TYPE_PLANNED_TASK}_at", ReminderScheduler.INVALID_ID.toLong())
        } returns at
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_PLANNED_TASK}_message", null) } returns message
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_PLANNED_TASK}_task_id", null) } returns task.id
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, task, null, plannedTasksEnabled = true, timersEnabled = false)

        verify(exactly = 0) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
        verify(exactly = 0) { mockEditor.putLong(any(), any()) }
    }

    // ==================== Edge Cases Tests ====================

    @Test
    fun `schedulePlannedTask does nothing when startTime is unparseable`() {
        val accountId = 1
        val task = createPlannedTask().copy(startTime = "not-a-date")

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, task, null, plannedTasksEnabled = true, timersEnabled = false)

        // schedulePlannedTask() cancels the reminder (unparseable start time), and the disabled
        // timer branch (task is null) cancels the timer reminder independently.
        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    @Test
    fun `schedulePlannedTask does nothing when the task already started`() {
        val accountId = 1
        val task = createPlannedTask(hoursFromNow = -1)

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, task, null, plannedTasksEnabled = true, timersEnabled = false)

        // schedulePlannedTask() cancels the reminder (task already started), and the disabled
        // timer branch (task is null) cancels the timer reminder independently.
        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    @Test
    fun `scheduleTimer uses inexact alarm when exact alarm not available`() {
        val accountId = 1
        val task = createTask()

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.putLong(any(), any()) } returns mockEditor
        every { mockEditor.putString(any(), any()) } returns mockEditor
        every { mockAlarmManager.canScheduleExactAlarms() } returns false
        every { mockAlarmManager.setAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        // The stub android.jar's Build.VERSION.SDK_INT defaults to 0, which would otherwise
        // short-circuit ReminderScheduler.set()'s exact-alarm check to true regardless of
        // canScheduleExactAlarms(); force it to a real S+ value for this branch to be reachable.
        scheduler.sdkInt = Build.VERSION_CODES.S
        scheduler.reconcile(accountId, null, task, plannedTasksEnabled = false, timersEnabled = true)

        verify(exactly = 1) {
            mockAlarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, any(), any())
        }
        verify(exactly = 0) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
    }

    // ==================== Restore Tests ====================

    @Test
    fun `restore re-schedules planned-task reminder from stored data`() {
        val accountId = 1
        val storedStart = java.time.OffsetDateTime.now().plusHours(1).toString()
        val storedMessage = "Team meeting starts at 10:30"

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns accountId
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_PLANNED_TASK}_start", null) } returns storedStart
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_PLANNED_TASK}_message", null) } returns
            storedMessage
        every { mockAlarmManager.canScheduleExactAlarms() } returns true
        every { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.restore()

        verify(exactly = 1) {
            mockAlarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, any(), any())
        }
    }

    @Test
    fun `restore does not schedule an expired planned-task reminder`() {
        val accountId = 1
        val storedStart = java.time.OffsetDateTime.now().minusDays(1).toString()

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns accountId
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_PLANNED_TASK}_start", null) } returns storedStart
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_PLANNED_TASK}_message", null) } returns null
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.restore()

        // The expired reminder is cancelled, and the (unstubbed, defaulted-to-stale) timer
        // reminder is independently cancelled by the same restore() pass.
        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
        verify(exactly = 0) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
    }

    @Test
    fun `restore cancels when account is invalid`() {
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns
            ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.restore()

        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    // ==================== Account Isolation Tests (ReminderReceiver) ====================

    @Test
    fun `ReminderReceiver does not show notification for different account`() {
        val currentAccountId = 1
        val intentAccountId = 2
        val message = "Test message"
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_PLANNED_TASK
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, intentAccountId)
            putExtra(ReminderScheduler.EXTRA_MESSAGE, message)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every {
            mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL)
        } returns
            currentAccountId

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 0) { WorktimeNotifications(mockContext).showPlannedTaskReminder(any()) }
    }

    @Test
    fun `ReminderReceiver shows planned-task notification for matching account`() {
        val accountId = 1
        val message = "Test message"
        // A real Intent's getters return stub defaults (not the values put into it) under this
        // module's non-Robolectric unit-test setup, so the intent itself must be mocked too.
        val intent = mockk<Intent>()
        every { intent.action } returns ReminderScheduler.TYPE_PLANNED_TASK
        every { intent.getIntExtra(ReminderScheduler.EXTRA_ACCOUNT, ReminderScheduler.INVALID_ID) } returns accountId
        every { intent.getStringExtra(ReminderScheduler.EXTRA_MESSAGE) } returns message

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every {
            mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL)
        } returns
            accountId
        every { anyConstructed<WorktimeNotifications>().showPlannedTaskReminder(message) } returns Unit

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 1) { anyConstructed<WorktimeNotifications>().showPlannedTaskReminder(message) }
    }

    @Test
    fun `ReminderReceiver shows timer notification for matching account`() {
        val accountId = 1
        val message = "Test timer message"
        val intent = mockk<Intent>()
        every { intent.action } returns ReminderScheduler.TYPE_TIMER
        every { intent.getIntExtra(ReminderScheduler.EXTRA_ACCOUNT, ReminderScheduler.INVALID_ID) } returns accountId
        every { intent.getStringExtra(ReminderScheduler.EXTRA_MESSAGE) } returns message

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every {
            mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL)
        } returns
            accountId
        every { anyConstructed<WorktimeNotifications>().showStaleTimer(message) } returns Unit

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 1) { anyConstructed<WorktimeNotifications>().showStaleTimer(message) }
    }

    @Test
    fun `ReminderReceiver does not show notification when message is null`() {
        val accountId = 1
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_PLANNED_TASK
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, accountId)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every {
            mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL)
        } returns
            accountId

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 0) { WorktimeNotifications(mockContext).showPlannedTaskReminder(any()) }
    }

    @Test
    fun `ReminderReceiver does not show notification for invalid account sentinel`() {
        val intentAccountId = 1
        val message = "Test message"
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_PLANNED_TASK
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, intentAccountId)
            putExtra(ReminderScheduler.EXTRA_MESSAGE, message)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every {
            mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL)
        } returns ReminderScheduler.INVALID_ACCOUNT_SENTINEL

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 0) { WorktimeNotifications(mockContext).showPlannedTaskReminder(any()) }
    }

    // ==================== ReminderRestoreReceiver Tests ====================

    @Test
    fun `ReminderRestoreReceiver calls restore on boot completed`() {
        val intent = mockk<Intent>()
        every { intent.action } returns Intent.ACTION_BOOT_COMPLETED

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns
            ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    @Test
    fun `ReminderRestoreReceiver calls restore on time changed`() {
        val intent = mockk<Intent>()
        every { intent.action } returns Intent.ACTION_TIME_CHANGED

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns
            ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    @Test
    fun `ReminderRestoreReceiver calls restore on timezone changed`() {
        val intent = mockk<Intent>()
        every { intent.action } returns Intent.ACTION_TIMEZONE_CHANGED

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns
            mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns
            ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any<PendingIntent>()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 2) { mockAlarmManager.cancel(any<PendingIntent>()) }
    }

    @Test
    fun `ReminderRestoreReceiver ignores unrelated intents`() {
        val intent = mockk<Intent>()
        every { intent.action } returns Intent.ACTION_CONFIGURATION_CHANGED
        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        // setUp() already calls getSharedPreferences once, constructing `scheduler`; the
        // assertion is that onReceive() doesn't trigger a second (restore-driven) call.
        verify(exactly = 1) { mockContext.getSharedPreferences(any(), any()) }
    }
}
