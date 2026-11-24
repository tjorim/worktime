package com.worktime.android.app.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Event
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.ui.graphics.vector.ImageVector

enum class WorktimeDestination(val route: String, val label: String, val icon: ImageVector) {
    Today(route = "today", label = "Today", icon = Icons.Filled.Schedule),
    NextShifts(route = "next-shifts", label = "Next", icon = Icons.Filled.Event),
    TeamStatus(route = "team-status", label = "Team", icon = Icons.Filled.Groups),
    Account(route = "account", label = "Account", icon = Icons.Filled.AccountCircle);

    companion object {
        /**
         * Routes of destinations that no longer exist, mapped to where they now live. Notifications
         * posted and intents saved by older builds can still carry them; "time-off" has no native
         * successor (it is a web entry point) and so falls back to Today like any unknown route.
         */
        private val LEGACY_ROUTES = mapOf("settings" to Account)

        /** The destination for [route], following [LEGACY_ROUTES]; Today for null or unknown routes. */
        fun fromRoute(route: String?): WorktimeDestination =
            entries.firstOrNull { it.route == route } ?: LEGACY_ROUTES[route] ?: Today
    }
}
