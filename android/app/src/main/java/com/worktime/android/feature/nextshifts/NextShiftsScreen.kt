package com.worktime.android.feature.nextshifts

import androidx.compose.runtime.Composable
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.components.ReadModelScreen
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard
import com.worktime.android.ui.components.formatDate
import com.worktime.android.ui.components.formatShift

@Composable
fun NextShiftsScreen(uiState: DashboardUiState, onRetry: () -> Unit) {
    ReadModelScreen(title = "Next shifts", uiState = uiState, onRetry = onRetry) { dashboard ->
        ScreenList(title = "Next shifts") {
            if (dashboard.nextShifts.items.isEmpty()) {
                item {
                    SummaryCard(title = "Next shifts") {
                        text("State", "No upcoming shifts available")
                    }
                }
            } else {
                dashboard.nextShifts.items.forEach { nextShift ->
                    item {
                        SummaryCard(title = "${formatDate(nextShift.date)} • Team ${nextShift.teamNumber}") {
                            text("Shift", formatShift(nextShift.shift))
                            text("Shift code", nextShift.shiftCode)
                        }
                    }
                }
            }
        }
    }
}
