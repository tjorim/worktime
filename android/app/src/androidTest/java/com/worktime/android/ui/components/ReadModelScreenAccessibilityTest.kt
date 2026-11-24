package com.worktime.android.ui.components

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.worktime.android.data.model.CurrentStatus
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FeatureFlags
import com.worktime.android.data.model.Identity
import com.worktime.android.data.model.NextShifts
import com.worktime.android.data.model.TeamStatus
import com.worktime.android.data.model.TimeOffSummary
import com.worktime.android.data.model.WorkContext
import com.worktime.android.feature.dashboard.DashboardUiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class ReadModelScreenAccessibilityTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private val isHeading = SemanticsMatcher.keyIsDefined(SemanticsProperties.Heading)
    private val isPoliteLiveRegion = SemanticsMatcher.expectValue(SemanticsProperties.LiveRegion, LiveRegionMode.Polite)

    private fun render(uiState: DashboardUiState, onRetry: () -> Unit = {}) {
        composeTestRule.setContent {
            ReadModelScreen(title = "Today", uiState = uiState, onRetry = onRetry) {
                ScreenList(title = "Today") {}
            }
        }
    }

    @Test
    fun loadedScreen_exposesItsTitleAsAHeading() {
        render(DashboardUiState.Success(sampleDashboard()))

        composeTestRule.onNode(isHeading and hasText("Today")).assertIsDisplayed()
    }

    @Test
    fun stateScreens_exposeTheirTitleAsAHeading() {
        render(DashboardUiState.Error("Check your connection."))

        composeTestRule.onNode(isHeading and hasText("Today")).assertIsDisplayed()
    }

    @Test
    fun errorState_announcesHeadlineAndMessageAsOneStatus() {
        render(DashboardUiState.Error("Check your connection."))

        composeTestRule
            .onNode(isPoliteLiveRegion and hasText("Unable to load Today"))
            .assertIsDisplayed()
        composeTestRule
            .onNode(isPoliteLiveRegion and hasText("Check your connection."))
            .assertIsDisplayed()
    }

    @Test
    fun errorState_retryStaysReachableAndWorksAtLargeFontScaleOnAShortWindow() {
        var retries = 0
        composeTestRule.setContent {
            LargeFontShortWindow {
                ReadModelScreen(
                    title = "Today",
                    uiState = DashboardUiState.Error("Check your connection and try again in a moment."),
                    onRetry = { retries++ }
                ) {}
            }
        }

        composeTestRule.onNode(hasScrollAction()).assertExists()
        composeTestRule.onNodeWithText("Retry").performScrollTo().assertIsDisplayed().performClick()
        assertEquals(1, retries)
    }

    @Test
    fun staleBanner_isAPoliteStatusWithARetryAction() {
        var retries = 0
        render(
            DashboardUiState.Success(
                sampleDashboard(),
                staleAsOf = "2026-05-26T10:00:00Z",
                refreshError = "Can't reach Worktime."
            ),
            onRetry = { retries++ }
        )

        composeTestRule
            .onNode(isPoliteLiveRegion and hasText("Can't reach Worktime.", substring = true))
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("Retry").assertIsDisplayed().performClick()
        assertEquals(1, retries)
    }

    @Test
    fun staleBanner_keepsRetryReachableAtLargeFontScaleOnAShortWindow() {
        var retries = 0
        composeTestRule.setContent {
            LargeFontShortWindow {
                ReadModelScreen(
                    title = "Today",
                    uiState =
                    DashboardUiState.Success(
                        sampleDashboard(),
                        staleAsOf = "2026-05-26T10:00:00Z",
                        refreshError = "Can't reach Worktime. Check your connection."
                    ),
                    onRetry = { retries++ }
                ) {}
            }
        }

        composeTestRule.onNodeWithText("Retry").performScrollTo().assertIsDisplayed().performClick()
        assertEquals(1, retries)
    }

    @Test
    fun summaryCardTitle_isAHeading() {
        composeTestRule.setContent { SummaryCard(title = "Current shift") {} }

        composeTestRule.onNode(isHeading and hasText("Current shift")).assertIsDisplayed()
    }

    @Composable
    private fun LargeFontShortWindow(content: @Composable () -> Unit) {
        val density = LocalDensity.current
        CompositionLocalProvider(LocalDensity provides Density(density.density, fontScale = 2f)) {
            Box(Modifier.width(320.dp).height(280.dp)) { content() }
        }
    }

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
