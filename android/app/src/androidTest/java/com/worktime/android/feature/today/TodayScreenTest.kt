package com.worktime.android.feature.today

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.feature.dashboard.MobileActionsUiState
import org.junit.Rule
import org.junit.Test

class TodayScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun renderToday(
        actionsState: MobileActionsUiState = MobileActionsUiState(),
        onStartTracking: (String, String?) -> Unit = { _, _ -> },
        onStopTracking: (String) -> Unit = {},
        onUpdateTask: (String, String?, String?) -> Unit = { _, _, _ -> }
    ) {
        composeTestRule.setContent {
            TodayScreen(
                uiState = DashboardUiState.Success(sampleDashboard()),
                actionsState = actionsState,
                onRetry = {},
                onStartTracking = onStartTracking,
                onStopTracking = onStopTracking,
                onUpdateTask = onUpdateTask,
                onSetWorkLocation = { _, _, _ -> },
                onDeleteWorkLocation = {},
                onCreateLabel = { _, _ -> }
            )
        }
    }

    @Test
    fun startTimerButton_isDisabledUntilTaskTextIsEntered() {
        renderToday()

        // TodayScreen is a LazyColumn, so the "Time tracking" card can sit below the fold on a
        // small AVD screen -- scroll it into view before asserting on it.
        composeTestRule.onNodeWithText("Start timer").performScrollTo().assertIsDisplayed().assertIsNotEnabled()
    }

    @Test
    fun startTimer_invokesCallbackWithEnteredTaskText() {
        var startedText: String? = null
        var startedLabelId: String? = null
        renderToday(onStartTracking = { text, labelId ->
            startedText = text
            startedLabelId = labelId
        })

        composeTestRule.onNodeWithText("Task").performScrollTo().performTextInput("Write report")
        composeTestRule.onNodeWithText("Start timer").performScrollTo().performClick()

        assert(startedText == "Write report") { "expected 'Write report', was $startedText" }
        assert(startedLabelId == null) { "expected no label, was $startedLabelId" }
    }

    @Test
    fun runningTask_showsUpdateAndStopButtonsInsteadOfStart() {
        renderToday(actionsState = MobileActionsUiState(runningTask = sampleRunningTask()))

        composeTestRule.onNodeWithText("Update task").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("Stop timer").performScrollTo().assertIsDisplayed()
    }

    @Test
    fun stopTimer_invokesCallbackWithRunningTaskId() {
        var stoppedId: String? = null
        renderToday(
            actionsState = MobileActionsUiState(runningTask = sampleRunningTask()),
            onStopTracking = { stoppedId = it }
        )

        composeTestRule.onNodeWithText("Stop timer").performScrollTo().performClick()

        assert(stoppedId == "task-1") { "expected 'task-1', was $stoppedId" }
    }

    @Test
    fun updateTask_invokesCallbackWithEditedText() {
        var updatedId: String? = null
        var updatedText: String? = null
        renderToday(
            actionsState = MobileActionsUiState(runningTask = sampleRunningTask()),
            onUpdateTask = { id, text, _ ->
                updatedId = id
                updatedText = text
            }
        )

        composeTestRule.onNodeWithText("Task").performScrollTo().performTextReplacement("Standup (edited)")
        composeTestRule.onNodeWithText("Update task").performScrollTo().performClick()

        assert(updatedId == "task-1") { "expected 'task-1', was $updatedId" }
        assert(updatedText == "Standup (edited)") { "expected 'Standup (edited)', was $updatedText" }
    }

    private fun sampleRunningTask() = TaskRecord(
        id = "task-1",
        userId = 1,
        labelId = null,
        text = "Standup",
        startTime = "2026-05-26T08:00:00Z",
        stopTime = null,
        includesBreak = false,
        createdAt = "2026-05-26T08:00:00Z"
    )

    private fun sampleDashboard(): DashboardResponse = DashboardResponse(
        asOf = "2026-05-26T12:00:00Z",
        identity = Identity(id = 1, username = "demo", displayName = "Demo User", isAdmin = false),
        workContext =
        WorkContext(
            scheduleType = "5-shift",
            teamNumber = 1,
            effectiveTeamNumber = 1,
            state = "ready",
            featureFlags = FeatureFlags(timeOffEnabled = true)
        ),
        currentStatus =
        CurrentStatus(
            asOf = "2026-05-26T12:00:00Z",
            currentShift = null,
            currentlyWorkingTeam = null,
            offDayProgress = null
        ),
        nextShifts = NextShifts(asOf = "2026-05-26T12:00:00Z", items = emptyList()),
        teamStatus = TeamStatus(asOf = "2026-05-26T12:00:00Z", items = emptyList()),
        timeOffSummary =
        TimeOffSummary(
            asOf = "2026-05-26T12:00:00Z",
            activeItems = emptyList(),
            upcomingItems = emptyList(),
            totalUpcoming = 0
        )
    )
}
