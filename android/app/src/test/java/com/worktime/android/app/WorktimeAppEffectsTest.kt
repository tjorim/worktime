package com.worktime.android.app

import com.worktime.android.core.notifications.ReminderScheduler
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.feature.dashboard.MobileActionsUiState
import com.worktime.android.feature.dashboard.ReadStatus
import io.mockk.mockk
import io.mockk.verify
import org.junit.Test

class WorktimeAppEffectsTest {
    private val scheduler = mockk<ReminderScheduler>(relaxed = true)
    private val timer = task("timer-1")
    private val planned = task("planned-1")

    @Test
    fun `flags both kinds unknown before any task read has succeeded`() {
        scheduler.reconcileFrom(ACCOUNT_ID, MobileActionsUiState(refreshFailed = true), true, true)

        verify(exactly = 1) {
            scheduler.reconcile(ACCOUNT_ID, null, null, true, true, plannedTaskKnown = false, timerKnown = false)
        }
    }

    @Test
    fun `treats each kind separately when only one read is known`() {
        val actions = MobileActionsUiState(runningTask = timer, timerStatus = ReadStatus.Confirmed)

        scheduler.reconcileFrom(ACCOUNT_ID, actions, true, true)

        verify(exactly = 1) {
            scheduler.reconcile(ACCOUNT_ID, null, timer, true, true, plannedTaskKnown = false, timerKnown = true)
        }
    }

    @Test
    fun `a confirmed absence is passed as known so stale alarms are cancelled`() {
        val actions = MobileActionsUiState(timerStatus = ReadStatus.Confirmed, plannedTaskStatus = ReadStatus.Confirmed)

        scheduler.reconcileFrom(ACCOUNT_ID, actions, true, true)

        verify(exactly = 1) {
            scheduler.reconcile(ACCOUNT_ID, null, null, true, true, plannedTaskKnown = true, timerKnown = true)
        }
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

        scheduler.reconcileFrom(ACCOUNT_ID, actions, true, false)

        verify(exactly = 1) {
            scheduler.reconcile(ACCOUNT_ID, planned, timer, true, false, plannedTaskKnown = true, timerKnown = true)
        }
    }

    @Test
    fun `reminder settings are forwarded even while the reads are unknown`() {
        scheduler.reconcileFrom(ACCOUNT_ID, MobileActionsUiState(), plannedTasksEnabled = false, timersEnabled = false)

        verify(exactly = 1) {
            scheduler.reconcile(ACCOUNT_ID, null, null, false, false, plannedTaskKnown = false, timerKnown = false)
        }
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
