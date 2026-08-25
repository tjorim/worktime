package com.worktime.android.core.notifications

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.worktime.android.app.WorktimeAndroidApplication
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking

/**
 * Reacts to the backend's silent "something changed, go reconcile" wake ping (#1205) by
 * re-running the same fetch-and-reconcile flow the foreground app uses -- see
 * [reconcilePlannedTaskReminder] -- so the local planned-task reminder alarm stays armed even
 * while the app is closed, instead of only when it's next opened. No reminder content ever
 * travels through FCM itself (see the backend's app.services.fcm_service): the payload here
 * carries nothing but a wake signal, and the reminder's own text/timing is computed identically
 * either way.
 *
 * Also keeps this device's registration token in sync with the backend via [onNewToken], called
 * whenever FCM issues or rotates one.
 *
 * Never registered at all unless the backend/Firebase project is actually configured -- see
 * android/README.md and the conditional `google-services` plugin apply in app/build.gradle.kts --
 * so this class simply never runs on a build/install that hasn't opted in.
 */
class WorktimeFirebaseMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val container = (applicationContext as? WorktimeAndroidApplication)?.container ?: return
        runCatching {
            runBlocking {
                val preferences = container.notificationPreferencesStore.preferences.first()
                reconcilePlannedTaskReminder(
                    repository = container.dashboardRepository,
                    reminderScheduler = ReminderScheduler(applicationContext),
                    plannedTasksEnabled = preferences.plannedTasksEnabled,
                    timersEnabled = preferences.timeTrackingEnabled
                )
            }
        }.onFailure { Log.w(TAG, "Wake-ping reconcile failed (non-fatal)", it) }
    }

    // onNewToken() itself is flagged deprecated by this Firebase SDK version with no documented
    // replacement yet -- Firebase's own current guidance still directs apps to override it to
    // learn about a rotated token, so this keeps doing exactly that rather than dropping token
    // rotation handling over an unresolved upstream deprecation.
    @Suppress("OVERRIDE_DEPRECATION")
    override fun onNewToken(token: String) {
        val container = (applicationContext as? WorktimeAndroidApplication)?.container ?: return
        runCatching {
            runBlocking { container.dashboardRepository.registerFcmToken(token) }
        }.onFailure { Log.w(TAG, "FCM token registration failed (non-fatal)", it) }
    }

    private companion object {
        const val TAG = "WorktimeFcmService"
    }
}
