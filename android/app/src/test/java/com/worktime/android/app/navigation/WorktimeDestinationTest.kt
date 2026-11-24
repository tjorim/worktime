package com.worktime.android.app.navigation

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class WorktimeDestinationTest {
    @Test
    fun companionScopeKeepsTodayNextTeamAndAccountOnly() {
        assertEquals(
            listOf("today", "next-shifts", "team-status", "account"),
            WorktimeDestination.entries.map { it.route }
        )
    }

    @Test
    fun currentRoutesResolveToThemselves() {
        WorktimeDestination.entries.forEach { destination ->
            assertEquals(destination, WorktimeDestination.fromRoute(destination.route))
        }
    }

    @Test
    fun obsoleteSettingsRouteOpensTheAccountDestination() {
        assertEquals(WorktimeDestination.Account, WorktimeDestination.fromRoute("settings"))
    }

    @Test
    fun obsoleteTimeOffRouteFallsBackToToday() {
        assertEquals(WorktimeDestination.Today, WorktimeDestination.fromRoute("time-off"))
    }

    @Test
    fun missingOrUnknownRoutesFallBackToToday() {
        assertEquals(WorktimeDestination.Today, WorktimeDestination.fromRoute(null))
        assertEquals(WorktimeDestination.Today, WorktimeDestination.fromRoute(""))
        assertEquals(WorktimeDestination.Today, WorktimeDestination.fromRoute("admin"))
    }

    @Test
    fun obsoleteRoutesAreNotShownInNavigation() {
        val routes = WorktimeDestination.entries.map { it.route }
        assertFalse("settings" in routes)
        assertFalse("time-off" in routes)
    }
}
