package com.worktime.android.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Settings
import androidx.compose.ui.graphics.vector.ImageVector

enum class WorktimeDestination(val route: String, val label: String, val icon: ImageVector) {
    Today(route = "today", label = "Today", icon = Icons.Filled.Schedule),
    NextShifts(route = "next-shifts", label = "Next", icon = Icons.Filled.Event),
    TeamStatus(route = "team-status", label = "Team", icon = Icons.Filled.Groups),
    TimeOff(route = "time-off", label = "Time Off", icon = Icons.Filled.EventBusy),
    Settings(route = "settings", label = "Settings", icon = Icons.Filled.Settings)
}
