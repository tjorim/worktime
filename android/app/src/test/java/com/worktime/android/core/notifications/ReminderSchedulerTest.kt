package com.worktime.android.core.notifications

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import com.worktime.android.data.model.NextShiftItem
import com.worktime.android.data.model.ShiftSummary
import com.worktime.android.data.model.TaskRecord
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkObject
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.unmockkObject
import io.mockk.unmockkStatic
import io.mockk.verify
import java.time.LocalDate
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

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(any(), any()) } returns mockSharedPrefs
        every { mockSharedPrefs.edit() } returns mockEditor
        every { mockEditor.apply() } returns Unit

        scheduler = ReminderScheduler(mockContext)
    }

    @After
    fun tearDown() {
        unmockkAll()
        unmockkStatic()
    }

    private fun createShift(startHour: Double? = 9.0, daysFromNow: Long = 1): NextShiftItem {
        val date = LocalDate.now().plusDays(daysFromNow)
        return NextShiftItem(
            date = date.toString(),
            shiftCode = "MORNING",
            teamNumber = 1,
            shift = ShiftSummary(
                code = "MORNING",
                displayCode = "MORNING",
                name = "Morning Shift",
                startHour = startHour,
                endHour = 17.0,
                isWorking = true
            )
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
    fun `reconcile schedules shift reminder when enabled and shift exists`() {
        val accountId = 1
        val shift = createShift()

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.putLong(any(), any()) } returns mockEditor
        every { mockEditor.putString(any(), any()) } returns mockEditor
        every { mockAlarmManager.canScheduleExactAlarms() } returns true
        every { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, shift, null, shiftsEnabled = true, timersEnabled = false)

        verify(exactly = 1) { mockEditor.putLong("${ReminderScheduler.TYPE_SHIFT}_at", any()) }
        verify(exactly = 1) { mockEditor.putString("${ReminderScheduler.TYPE_SHIFT}_message", any()) }
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

        scheduler.reconcile(accountId, null, task, shiftsEnabled = false, timersEnabled = true)

        verify(exactly = 1) { mockEditor.putLong("${ReminderScheduler.TYPE_TIMER}_at", any()) }
        verify(exactly = 1) { mockEditor.putString("${ReminderScheduler.TYPE_TIMER}_message", any()) }
        verify(exactly = 1) { mockEditor.putString("${ReminderScheduler.TYPE_TIMER}_task_id", "task-1") }
    }

    // ==================== Cancellation Tests ====================

    @Test
    fun `reconcile cancels shift reminder when disabled`() {
        val accountId = 1

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, null, null, shiftsEnabled = false, timersEnabled = false)

        verify(exactly = 1) { mockAlarmManager.cancel(any()) }
        verify(exactly = 1) { mockEditor.remove("${ReminderScheduler.TYPE_SHIFT}_at") }
    }

    @Test
    fun `cancelAll cancels both reminder types`() {
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.clear() } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.cancelAll()

        verify(exactly = 2) { mockAlarmManager.cancel(any()) }
        verify(exactly = 1) { mockEditor.clear() }
    }

    @Test
    fun `reconcile cancels all when account changes`() {
        val oldAccountId = 1
        val newAccountId = 2

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, newAccountId) } returns oldAccountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, newAccountId) } returns mockEditor
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.clear() } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(newAccountId, null, null, shiftsEnabled = false, timersEnabled = false)

        verify(exactly = 1) { mockEditor.clear() }
        verify(exactly = 2) { mockAlarmManager.cancel(any()) }
    }

    @Test
    fun `reconcile with null shift and null task cancels both reminders`() {
        val accountId = 1

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockSharedPrefs.getString(any(), any()) } returns null
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, null, null, shiftsEnabled = true, timersEnabled = true)

        verify(exactly = 2) { mockAlarmManager.cancel(any()) }
    }

    // ==================== Rescheduling Tests ====================

    @Test
    fun `reconcile reschedules when shift changes`() {
        val accountId = 1
        val oldShift = createShift(startHour = 9.0)
        val newShift = createShift(startHour = 10.0)

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockSharedPrefs.getLong(any(), any()) } returnsMany listOf(1000L, 2000L)
        every { mockSharedPrefs.getString(any(), any()) } returnsMany listOf("old", "new")
        every { mockEditor.putLong(any(), any()) } returns mockEditor
        every { mockEditor.putString(any(), any()) } returns mockEditor
        every { mockAlarmManager.canScheduleExactAlarms() } returns true
        every { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        // First reconcile with old shift
        scheduler.reconcile(accountId, oldShift, null, shiftsEnabled = true, timersEnabled = false)
        // Then reconcile with new shift
        scheduler.reconcile(accountId, newShift, null, shiftsEnabled = true, timersEnabled = false)

        verify(exactly = 2) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
    }

    // ==================== Deduplication Tests ====================

    @Test
    fun `persistAndSet skips when nothing changed`() {
        val accountId = 1
        val shift = createShift()
        val at = System.currentTimeMillis() + 3600000
        val message = "Shift MORNING starts at 09:00"

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockSharedPrefs.getLong("${ReminderScheduler.TYPE_SHIFT}_at", ReminderScheduler.INVALID_ID.toLong()) } returns at
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_message", null) } returns message
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_date", null) } returns shift.date
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_hour", null) } returns "9.0"
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, shift, null, shiftsEnabled = true, timersEnabled = false)

        verify(exactly = 0) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
        verify(exactly = 0) { mockEditor.putLong(any(), any()) }
    }

    // ==================== Edge Cases Tests ====================

    @Test
    fun `scheduleShift does nothing when shift startHour is null`() {
        val accountId = 1
        val shift = createShift(startHour = null)

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, shift, null, shiftsEnabled = true, timersEnabled = false)

        verify(exactly = 1) { mockAlarmManager.cancel(any()) }
    }

    @Test
    fun `scheduleShift does nothing when shift is in the past`() {
        val accountId = 1
        val shift = createShift(daysFromNow = -1)

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, any()) } returns accountId
        every { mockEditor.putInt(ReminderScheduler.KEY_ACCOUNT, accountId) } returns mockEditor
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.reconcile(accountId, shift, null, shiftsEnabled = true, timersEnabled = false)

        verify(exactly = 1) { mockAlarmManager.cancel(any()) }
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

        scheduler.reconcile(accountId, null, task, shiftsEnabled = false, timersEnabled = true)

        verify(exactly = 1) {
            mockAlarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, any(), any())
        }
        verify(exactly = 0) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
    }

    // ==================== Restore Tests ====================

    @Test
    fun `restore re-schedules shift reminder from stored data`() {
        val accountId = 1
        val storedDate = LocalDate.now().plusDays(1).toString()
        val storedHour = "9.5"
        val storedMessage = "Shift MORNING starts at 09:30"

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns accountId
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_date", null) } returns storedDate
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_hour", null) } returns storedHour
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_message", null) } returns storedMessage
        every { mockAlarmManager.canScheduleExactAlarms() } returns true
        every { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) } returns Unit
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.restore()

        verify(exactly = 1) {
            mockAlarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, any(), any())
        }
    }

    @Test
    fun `restore does not schedule expired shift reminder`() {
        val accountId = 1
        val storedDate = LocalDate.now().minusDays(1).toString()
        val storedHour = "9.0"

        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns accountId
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_date", null) } returns storedDate
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_hour", null) } returns storedHour
        every { mockSharedPrefs.getString("${ReminderScheduler.TYPE_SHIFT}_message", null) } returns null
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.restore()

        verify(exactly = 1) { mockAlarmManager.cancel(any()) }
        verify(exactly = 0) { mockAlarmManager.setExactAndAllowWhileIdle(any(), any(), any()) }
    }

    @Test
    fun `restore cancels when account is invalid`() {
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        scheduler.restore()

        verify(exactly = 2) { mockAlarmManager.cancel(any()) }
    }

    // ==================== Account Isolation Tests (ReminderReceiver) ====================

    @Test
    fun `ReminderReceiver does not show notification for different account`() {
        val currentAccountId = 1
        val intentAccountId = 2
        val message = "Test message"
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_SHIFT
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, intentAccountId)
            putExtra(ReminderScheduler.EXTRA_MESSAGE, message)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL) } returns currentAccountId

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 0) { WorktimeNotifications(mockContext).showShiftReminder(any()) }
    }

    @Test
    fun `ReminderReceiver shows shift notification for matching account`() {
        val accountId = 1
        val message = "Test message"
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_SHIFT
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, accountId)
            putExtra(ReminderScheduler.EXTRA_MESSAGE, message)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL) } returns accountId

        val mockNotifications = mockk<WorktimeNotifications>(relaxed = true)
        every { WorktimeNotifications(mockContext) } returns mockNotifications
        every { mockNotifications.showShiftReminder(message) } returns Unit

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 1) { mockNotifications.showShiftReminder(message) }
    }

    @Test
    fun `ReminderReceiver shows timer notification for matching account`() {
        val accountId = 1
        val message = "Test timer message"
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_TIMER
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, accountId)
            putExtra(ReminderScheduler.EXTRA_MESSAGE, message)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL) } returns accountId

        val mockNotifications = mockk<WorktimeNotifications>(relaxed = true)
        every { WorktimeNotifications(mockContext) } returns mockNotifications
        every { mockNotifications.showStaleTimer(message) } returns Unit

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 1) { mockNotifications.showStaleTimer(message) }
    }

    @Test
    fun `ReminderReceiver does not show notification when message is null`() {
        val accountId = 1
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_SHIFT
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, accountId)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL) } returns accountId

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 0) { WorktimeNotifications(mockContext).showShiftReminder(any()) }
    }

    @Test
    fun `ReminderReceiver does not show notification for invalid account sentinel`() {
        val intentAccountId = 1
        val message = "Test message"
        val intent = Intent().apply {
            action = ReminderScheduler.TYPE_SHIFT
            putExtra(ReminderScheduler.EXTRA_ACCOUNT, intentAccountId)
            putExtra(ReminderScheduler.EXTRA_MESSAGE, message)
        }

        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ACCOUNT_SENTINEL) } returns ReminderScheduler.INVALID_ACCOUNT_SENTINEL

        val receiver = ReminderReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 0) { WorktimeNotifications(mockContext).showShiftReminder(any()) }
    }

    // ==================== ReminderRestoreReceiver Tests ====================

    @Test
    fun `ReminderRestoreReceiver calls restore on boot completed`() {
        val intent = Intent(Intent.ACTION_BOOT_COMPLETED)

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 2) { mockAlarmManager.cancel(any()) }
    }

    @Test
    fun `ReminderRestoreReceiver calls restore on time changed`() {
        val intent = Intent(Intent.ACTION_TIME_CHANGED)

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 2) { mockAlarmManager.cancel(any()) }
    }

    @Test
    fun `ReminderRestoreReceiver calls restore on timezone changed`() {
        val intent = Intent(Intent.ACTION_TIMEZONE_CHANGED)

        every { mockContext.getSystemService(AlarmManager::class.java) } returns mockAlarmManager
        every { mockContext.getSharedPreferences(ReminderScheduler.STORE, Context.MODE_PRIVATE) } returns mockSharedPrefs
        every { mockSharedPrefs.getInt(ReminderScheduler.KEY_ACCOUNT, ReminderScheduler.INVALID_ID) } returns ReminderScheduler.INVALID_ID
        every { mockAlarmManager.cancel(any()) } returns Unit
        every { mockEditor.remove(any()) } returns mockEditor
        every { PendingIntent.getBroadcast(any(), any(), any(), any()) } returns mockk()

        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 2) { mockAlarmManager.cancel(any()) }
    }

    @Test
    fun `ReminderRestoreReceiver ignores unrelated intents`() {
        val intent = Intent(Intent.ACTION_CONFIGURATION_CHANGED)

        // No mocks needed for restore since it shouldn't be called
        val receiver = ReminderRestoreReceiver()
        receiver.onReceive(mockContext, intent)

        verify(exactly = 0) { mockContext.getSharedPreferences(any(), any()) }
    }
}
