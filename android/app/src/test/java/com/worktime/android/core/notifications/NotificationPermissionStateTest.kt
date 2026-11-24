package com.worktime.android.core.notifications

import android.os.Build
import org.junit.Assert.assertEquals
import org.junit.Test

class NotificationPermissionStateTest {
    private fun resolve(
        sdkInt: Int = Build.VERSION_CODES.TIRAMISU,
        permissionGranted: Boolean = false,
        notificationsEnabled: Boolean = false,
        permissionRequested: Boolean = false,
        shouldShowRationale: Boolean = false
    ) = resolveNotificationPermissionState(
        sdkInt,
        permissionGranted,
        notificationsEnabled,
        permissionRequested,
        shouldShowRationale
    )

    @Test
    fun `granted permission with notifications enabled needs no prompt`() {
        assertEquals(
            NotificationPermissionState.Granted,
            resolve(permissionGranted = true, notificationsEnabled = true)
        )
    }

    @Test
    fun `granted permission but notifications switched off app-wide points to settings`() {
        assertEquals(
            NotificationPermissionState.NeedsSettings,
            resolve(permissionGranted = true, notificationsEnabled = false)
        )
    }

    @Test
    fun `never asked offers the permission prompt`() {
        assertEquals(NotificationPermissionState.NotRequested, resolve())
    }

    @Test
    fun `denied once with rationale offers a retry`() {
        assertEquals(
            NotificationPermissionState.DeniedCanRetry,
            resolve(permissionRequested = true, shouldShowRationale = true)
        )
    }

    @Test
    fun `denied without rationale after asking means the system will not prompt again`() {
        assertEquals(
            NotificationPermissionState.NeedsSettings,
            resolve(permissionRequested = true, shouldShowRationale = false)
        )
    }

    @Test
    fun `before Android 13 only the app-wide switch matters`() {
        val preTiramisu = Build.VERSION_CODES.S
        assertEquals(
            NotificationPermissionState.Granted,
            resolve(sdkInt = preTiramisu, notificationsEnabled = true)
        )
        assertEquals(
            NotificationPermissionState.NeedsSettings,
            resolve(sdkInt = preTiramisu, notificationsEnabled = false)
        )
    }
}
