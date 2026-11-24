package com.worktime.android.app

import com.worktime.android.core.notifications.ReminderScheduler
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.feature.dashboard.MobileActionsUiState
import com.worktime.android.feature.dashboard.ReadStatus
import io.mockk.mockk
import io.mockk.verify
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WorktimeAppEffectsTest {
    private val scheduler = mockk<ReminderScheduler>(relaxed = true)
    private val timer = task("timer-1")
    private val planned = task("planned-1")

    @Test
    fun `does not reconcile before the task reads have succeeded`() {
        val reconciled = scheduler.reconcileFrom(ACCOUNT_ID, MobileActionsUiState(refreshFailed = true), true, true)

        assertFalse(reconciled)
        verify(exactly = 0) { scheduler.reconcile(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `does not reconcile when only one of the task reads is known`() {
        val actions = MobileActionsUiState(timerStatus = ReadStatus.Confirmed)

        assertFalse(scheduler.reconcileFrom(ACCOUNT_ID, actions, true, true))
        verify(exactly = 0) { scheduler.reconcile(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `a confirmed absence reconciles with null so stale alarms are cancelled`() {
        val actions = MobileActionsUiState(timerStatus = ReadStatus.Confirmed, plannedTaskStatus = ReadStatus.Confirmed)

        assertTrue(scheduler.reconcileFrom(ACCOUNT_ID, actions, true, true))
        verify(exactly = 1) { scheduler.reconcile(ACCOUNT_ID, null, null, true, true) }
    }

    @Test
    fun `stale tasks reconcile with the last-known values so the alarms are retained`() {
        val actions =
            MobileActionsUiState(
                runningTask = timer,
                timerStatus = ReadStatus.Stale,
                plannedTask = planned,
                plannedTaskStatus = ReadStatus.Stale,
                refreshFailed = true
            )

        assertTrue(scheduler.reconcileFrom(ACCOUNT_ID, actions, true, false))
        verify(exactly = 1) { scheduler.reconcile(ACCOUNT_ID, planned, timer, true, false) }
    }

    private fun task(id: String) = TaskRecord(
        id = id,
        labelId = null,
        text = id,
        startTime = "2026-05-26T12:00:00Z",
        stopTime = null,
        includesBreak = false,
        createdAt = "2026-05-26T12:00:00Z"
    )

    private companion object {
        const val ACCOUNT_ID = 7
    }
}
