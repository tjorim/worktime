package com.worktime.android.feature.teamstatus

import androidx.compose.runtime.Composable
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.components.ReadModelScreen
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard
import com.worktime.android.ui.components.formatShift

@Composable
fun TeamStatusScreen(uiState: DashboardUiState, onRetry: () -> Unit) {
    ReadModelScreen(title = "Team status", uiState = uiState, onRetry = onRetry) { dashboard ->
        ScreenList(title = "Team status") {
            if (dashboard.teamStatus.items.isEmpty()) {
                item {
                    SummaryCard(title = "Team status") {
                        text("State", "No schedule selected yet")
                    }
                }
            } else {
                dashboard.teamStatus.items.forEach { teamItem ->
                    item {
                        SummaryCard(title = "Team ${teamItem.teamNumber}") {
                            text("Shift", formatShift(teamItem.shift))
                            text("Current", if (teamItem.isCurrentlyWorking) "Working now" else "Not active")
                            text("Shift code", teamItem.shiftCode)
                        }
                    }
                }
            }
        }
    }
}
