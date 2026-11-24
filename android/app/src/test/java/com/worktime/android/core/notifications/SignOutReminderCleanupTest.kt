package com.worktime.android.core.notifications

import com.worktime.android.core.auth.SessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SignOutReminderCleanupTest {
    @Test
    fun `clears reminders when the session ends and not while it is active`() = runTest(UnconfinedTestDispatcher()) {
        val session = MutableStateFlow<SessionState>(SessionState.Initializing)
        var clears = 0
        backgroundScope.launch { clearRemindersOnSignOut(session) { clears++ } }

        session.value = SessionState.Authenticated(hasRefreshToken = true)
        assertEquals(0, clears)

        session.value = SessionState.LoggedOut
        assertEquals(1, clears)
    }

    @Test
    fun `clears again on a later sign-out after signing back in`() = runTest(UnconfinedTestDispatcher()) {
        val session = MutableStateFlow<SessionState>(SessionState.LoggedOut)
        var clears = 0
        backgroundScope.launch { clearRemindersOnSignOut(session) { clears++ } }
        assertEquals(1, clears)

        session.value = SessionState.Authenticated(hasRefreshToken = true)
        session.value = SessionState.LoggedOut
        assertEquals(2, clears)
    }
}
