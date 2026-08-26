package com.worktime.android.core.notifications

import android.util.Log
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.worktime.android.app.WorktimeAndroidApplication
import kotlinx.coroutines.runBlocking

/**
 * Reacts to the backend's silent "something changed, go reconcile" wake ping (#1205) by
 * enqueueing [PlannedTaskReminderReconcileWorker], which re-runs the same fetch-and-reconcile
 * flow the foreground app uses -- see [reconcilePlannedTaskReminder] -- so the local planned-task
 * reminder alarm stays armed even while the app is closed, instead of only when it's next opened.
 * No reminder content ever travels through FCM itself (see the backend's app.services.fcm_service):
 * the payload here carries nothing but a wake signal, and the reminder's own text/timing is
 * computed identically either way.
 *
 * The reconcile itself runs via WorkManager rather than inline here: `onMessageReceived` has only
 * a short (roughly 10-20s, per Firebase's own guidance) execution window before the OS may
 * reclaim the process, and `setExpedited` lets WorkManager use the brief quota exemption granted
 * for work triggered by a high-priority FCM message (see #1225). `REPLACE` on the unique work name
 * means a newer wake ping supersedes an older, not-yet-run one rather than queuing redundant
 * reconciles -- each run fetches fresh state regardless of which wake triggered it.
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
        val workRequest =
            OneTimeWorkRequestBuilder<PlannedTaskReminderReconcileWorker>()
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .build()
        WorkManager.getInstance(applicationContext).enqueueUniqueWork(
            PlannedTaskReminderReconcileWorker.WORK_NAME,
            ExistingWorkPolicy.REPLACE,
            workRequest
        )
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
