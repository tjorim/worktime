package com.worktime.android.core.notifications

import android.os.Build

/** What the reminder experience should offer for the app's notification permission. */
enum class NotificationPermissionState {
    /** Reminders can be posted; nothing to show. */
    Granted,

    /** The permission was never requested: explain why reminders need it, then ask. */
    NotRequested,

    /** The user declined once but the system will still show the prompt: explain and offer to retry. */
    DeniedCanRetry,

    /** The system will not prompt again (or notifications are off app-wide): send the user to settings. */
    NeedsSettings
}

/**
 * Pure decision behind [NotificationPermissionState], kept free of framework calls so every branch
 * is unit-testable. [permissionRequested] is persisted by the app: before Android 13's
 * `shouldShowRequestPermissionRationale` can't tell "never asked" apart from "don't ask again".
 */
@Suppress("LongParameterList")
fun resolveNotificationPermissionState(
    sdkInt: Int,
    permissionGranted: Boolean,
    notificationsEnabled: Boolean,
    permissionRequested: Boolean,
    shouldShowRationale: Boolean
): NotificationPermissionState = when {
    // Below Android 13 there is no runtime permission: only the system-wide switch can block us.
    sdkInt < Build.VERSION_CODES.TIRAMISU ->
        if (notificationsEnabled) NotificationPermissionState.Granted else NotificationPermissionState.NeedsSettings
    permissionGranted ->
        if (notificationsEnabled) NotificationPermissionState.Granted else NotificationPermissionState.NeedsSettings
    !permissionRequested -> NotificationPermissionState.NotRequested
    shouldShowRationale -> NotificationPermissionState.DeniedCanRetry
    else -> NotificationPermissionState.NeedsSettings
}
