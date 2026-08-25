package com.worktime.android.core.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessaging

/**
 * Triggers FCM registration for this device (#1205), if it isn't already registered.
 *
 * This SDK delivers the actual token exclusively through
 * [WorktimeFirebaseMessagingService.onNewToken] -- there is no synchronous "give me the current
 * token" call anymore (`FirebaseMessaging.getToken()` throws `IllegalStateException` unless the
 * app opts back into the legacy model) -- so this call's only job is to make sure registration
 * has been kicked off; `onNewToken` is what actually sends the token to the backend.
 * [FirebaseMessaging.register] is safe to call repeatedly: a device already registered is a no-op.
 *
 * Best-effort and silent when Firebase isn't configured for this build (no
 * google-services.json -- see android/README.md) or the device has no Play Services:
 * [FirebaseMessaging.getInstance] throws in that case, which is treated the same as "nothing to
 * register" rather than surfaced as an error.
 */
fun registerFcmTokenIfNeeded() {
    runCatching {
        FirebaseMessaging.getInstance().register()
    }.onFailure { Log.d(TAG, "FCM unavailable on this build/device, skipping registration: $it") }
}

private const val TAG = "FcmTokenRegistration"
