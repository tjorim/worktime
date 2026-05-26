package com.worktime.android.feature.today

import androidx.compose.runtime.Composable
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.components.ReadModelScreen
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard
import com.worktime.android.ui.components.formatInstant
import com.worktime.android.ui.components.formatShift

@Composable
fun TodayScreen(uiState: DashboardUiState, onRetry: () -> Unit) {
    ReadModelScreen(title = "Today", uiState = uiState, onRetry = onRetry) { dashboard ->
        ScreenList(title = "Today") {
            item {
                SummaryCard(title = "Session") {
                    text("User", dashboard.identity.displayName)
                    text("Schedule", dashboard.workContext.scheduleType ?: "Not configured")
                    text("Team", dashboard.workContext.effectiveTeamNumber?.toString() ?: "Not configured")
                    text("Updated", formatInstant(dashboard.asOf))
                }
            }
            item {
                SummaryCard(title = "Current shift") {
                    val current = dashboard.currentStatus.currentShift
                    text("Status", current?.shift?.let(::formatShift) ?: "No work context yet")
                    text("Shift code", current?.shiftCode ?: "—")
                    text(
                        "Working now",
                        if (dashboard.currentStatus.currentlyWorkingTeam != null) {
                            "Team ${dashboard.currentStatus.currentlyWorkingTeam.teamNumber}"
                        } else {
                            "Nobody scheduled right now"
                        },
                    )
                    text(
                        "Off-day progress",
                        dashboard.currentStatus.offDayProgress?.let { "${it.current}/${it.total}" } ?: "—",
                    )
                }
            }
        }
    }
}
