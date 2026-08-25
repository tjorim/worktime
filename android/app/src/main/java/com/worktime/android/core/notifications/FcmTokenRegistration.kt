package com.worktime.android.core.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging
import com.worktime.android.app.WorktimeAppContainer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Fetches this device's current FCM registration token and registers it with the backend
 * (#1205).
 *
 * Uses the classic `getToken()` API (deprecation suppressed deliberately): this SDK's newer
 * `register()` + `onRegistered(installationId)` flow requires opting in via the
 * `firebase_messaging_installation_id_enabled` manifest flag -- unset here -- and without it
 * `register()` unconditionally throws `IllegalStateException`. It would also be the wrong fix
 * even with the flag set: that flow yields a Firebase Installation ID, a different identifier
 * than the FCM registration token the backend's `FcmDeviceToken` table and
 * `messaging.send(token=...)` call actually expect. `getToken()` remains fully functional
 * without the flag and returns exactly the token the backend wants.
 *
 * Best-effort and silent when Firebase isn't configured for this build (no
 * google-services.json -- see android/README.md) or the device has no Play Services:
 * [FirebaseMessaging.getInstance] (or the token fetch itself) throws in that case, which is
 * treated the same as "nothing to register" rather than surfaced as an error.
 */
suspend fun registerFcmTokenIfNeeded(container: WorktimeAppContainer) {
    val token =
        runCatching { fetchFcmToken() }
            .onFailure { Log.d(TAG, "FCM unavailable on this build/device, skipping token registration: $it") }
            .getOrNull() ?: return
    container.dashboardRepository.registerFcmToken(token)
}

@Suppress("DEPRECATION")
private suspend fun fetchFcmToken(): String = suspendCancellableCoroutine { continuation ->
    FirebaseMessaging.getInstance().token
        .addOnSuccessListener { token -> continuation.resume(token) }
        .addOnFailureListener { error -> continuation.resumeWithException(error) }
}

private const val TAG = "FcmTokenRegistration"
