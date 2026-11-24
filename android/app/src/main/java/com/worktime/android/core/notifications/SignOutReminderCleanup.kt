package com.worktime.android.core.notifications

import com.worktime.android.core.auth.SessionState
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.filterIsInstance

/**
 * Runs [clear] each time the session ends, whatever ended it. Observing the session itself, rather
 * than a screen, also covers a background sign-out (for example a revoked refresh token found by
 * an FCM wake) that never composes any UI, so task names don't linger in the notification shade.
 */
suspend fun clearRemindersOnSignOut(sessionState: Flow<SessionState>, clear: () -> Unit) {
    sessionState.filterIsInstance<SessionState.LoggedOut>().collect { clear() }
}
