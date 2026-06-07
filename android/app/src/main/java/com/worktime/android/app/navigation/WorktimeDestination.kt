package com.worktime.android.app.navigation

enum class WorktimeDestination(val route: String, val label: String, val emoji: String) {
    Today(route = "today", label = "Today", emoji = "🕒"),
    NextShifts(route = "next-shifts", label = "Next", emoji = "➡️"),
    TeamStatus(route = "team-status", label = "Team", emoji = "👥"),
    TimeOff(route = "time-off", label = "Time Off", emoji = "🌴"),
    Settings(route = "settings", label = "Settings", emoji = "⚙️")
}
