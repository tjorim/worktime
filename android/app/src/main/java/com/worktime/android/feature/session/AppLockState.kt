package com.worktime.android.feature.session

/**
 * Whether authenticated content may be composed. The app starts in [Resolving] and nothing
 * authenticated renders until the persisted lock preferences have been read and applied.
 */
sealed interface AppLockState {
    /** The lock decision has not been made yet; render neither content nor the unlock prompt. */
    data object Resolving : AppLockState

    /** Authentication is required before any authenticated content is shown. */
    data object Locked : AppLockState

    /** The lock is disabled, still within its idle window, or the user authenticated. */
    data object Unlocked : AppLockState
}
