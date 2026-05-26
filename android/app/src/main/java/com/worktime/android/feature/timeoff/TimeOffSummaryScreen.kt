package com.worktime.android.feature.timeoff

import androidx.compose.runtime.Composable
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.components.ReadModelScreen
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard

@Composable
fun TimeOffSummaryScreen(uiState: DashboardUiState, onRetry: () -> Unit) {
    ReadModelScreen(title = "Time off", uiState = uiState, onRetry = onRetry) { dashboard ->
        ScreenList(title = "Time off") {
            item {
                SummaryCard(title = "Summary") {
                    text("Upcoming entries", dashboard.timeOffSummary.totalUpcoming.toString())
                    text("Active now", dashboard.timeOffSummary.activeItems.size.toString())
                    text(
                        "Feature flag",
                        if (dashboard.workContext.featureFlags.timeOffEnabled) "Enabled" else "Disabled",
                    )
                }
            }
            dashboard.timeOffSummary.activeItems.forEach { activeItem ->
                item {
                    SummaryCard(title = "Active • ${activeItem.entryType}") {
                        text("Dates", "${activeItem.startsOn} → ${activeItem.endsOn}")
                        text("Note", activeItem.note ?: "—")
                    }
                }
            }
            dashboard.timeOffSummary.upcomingItems.forEach { upcomingItem ->
                item {
                    SummaryCard(title = "Upcoming • ${upcomingItem.entryType}") {
                        text("Dates", "${upcomingItem.startsOn} → ${upcomingItem.endsOn}")
                        text("Recurring", if (upcomingItem.isRecurringWeekly) "Weekly" else "No")
                        text("Note", upcomingItem.note ?: "—")
                    }
                }
            }
        }
    }
}
