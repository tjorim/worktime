package com.worktime.android.app

import com.worktime.android.core.auth.SessionState
import com.worktime.android.feature.session.AppLockState
import org.junit.Assert.assertEquals
import org.junit.Test

class AppSurfaceTest {
    private val signedIn = SessionState.Authenticated(hasRefreshToken = true)
    private val sessionsThatMayExist = listOf(signedIn, SessionState.Initializing, SessionState.Error("x"))

    private fun surface(lock: AppLockState, session: SessionState, dashboardLoggedOut: Boolean = false): AppSurface =
        resolveAppSurface(lock, session, dashboardLoggedOut)

    @Test
    fun pendingLockDecisionRendersNoAuthenticatedContent() {
        sessionsThatMayExist.forEach { session ->
            assertEquals(AppSurface.LockResolving, surface(AppLockState.Resolving, session))
        }
    }

    @Test
    fun lockedStateShowsTheGateEvenWhileTheSessionIsInitializing() {
        sessionsThatMayExist.forEach { session ->
            assertEquals(AppSurface.LockGate, surface(AppLockState.Locked, session))
        }
    }

    @Test
    fun lockedStateWinsOverALoggedOutDashboardWhileTheSessionPersists() {
        assertEquals(AppSurface.LockGate, surface(AppLockState.Locked, signedIn, dashboardLoggedOut = true))
    }

    @Test
    fun loggedOutSessionShowsLoginRegardlessOfLock() {
        listOf(AppLockState.Resolving, AppLockState.Locked, AppLockState.Unlocked).forEach { lock ->
            assertEquals(AppSurface.Login, surface(lock, SessionState.LoggedOut))
        }
    }

    @Test
    fun unlockedWithLoggedOutDashboardShowsLogin() {
        assertEquals(AppSurface.Login, surface(AppLockState.Unlocked, signedIn, dashboardLoggedOut = true))
    }

    @Test
    fun unlockedSessionShowsContent() {
        sessionsThatMayExist.forEach { session ->
            assertEquals(AppSurface.Authenticated, surface(AppLockState.Unlocked, session))
        }
    }
}
