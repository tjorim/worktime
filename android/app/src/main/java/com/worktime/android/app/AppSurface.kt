package com.worktime.android.app

import com.worktime.android.core.auth.SessionState
import com.worktime.android.feature.session.AppLockState

/** What the root of the app may render. Authenticated content is reachable only via [Authenticated]. */
internal enum class AppSurface {
    /** The lock decision is pending: render nothing authenticated. */
    LockResolving,

    /** The app lock is engaged. */
    LockGate,

    /** No session: show sign-in. */
    Login,

    /** Content may be shown. */
    Authenticated
}

/**
 * The lock applies whenever a session may exist (anything but [SessionState.LoggedOut]), including
 * while it is still [SessionState.Initializing], so the lock decision always wins over content.
 */
internal fun resolveAppSurface(
    lockState: AppLockState,
    sessionState: SessionState,
    dashboardLoggedOut: Boolean
): AppSurface {
    val sessionMayExist = sessionState !is SessionState.LoggedOut
    return when {
        sessionMayExist && lockState == AppLockState.Resolving -> AppSurface.LockResolving
        sessionMayExist && lockState == AppLockState.Locked -> AppSurface.LockGate
        !sessionMayExist || dashboardLoggedOut -> AppSurface.Login
        else -> AppSurface.Authenticated
    }
}
