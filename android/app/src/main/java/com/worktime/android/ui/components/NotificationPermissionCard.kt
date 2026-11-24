package com.worktime.android.ui.components

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.worktime.android.core.notifications.NotificationPermissionState
import com.worktime.android.core.notifications.resolveNotificationPermissionState

/**
 * Asks for the notification permission in the context of the reminders that need it, explains a
 * denial and links to the system settings once Android will no longer show its prompt. Renders
 * nothing while notifications are allowed.
 */
@Composable
fun NotificationPermissionCard(permissionRequested: Boolean, onPermissionRequested: () -> Unit) {
    val context = LocalContext.current
    // Bumped when the user returns from system settings or answers the prompt, to re-read the state.
    var refresh by remember { mutableIntStateOf(0) }
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer =
            LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) refresh++ }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
            onPermissionRequested()
            refresh++
        }
    // `refresh` is read so the state is recomputed whenever it changes.
    val state = refresh.let { currentNotificationPermissionState(context, permissionRequested) }
    NotificationPermissionPrompt(
        state = state,
        onRequestPermission = {
            // Record the request up front: if the system suppresses the dialog the result callback
            // may not tell us anything, and the next state must not read as "never asked".
            onPermissionRequested()
            launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
        },
        onOpenSettings = { openNotificationSettings(context) }
    )
}

/** Stateless content for [NotificationPermissionCard], separated so it can be tested per state. */
@Composable
fun NotificationPermissionPrompt(
    state: NotificationPermissionState,
    onRequestPermission: () -> Unit,
    onOpenSettings: () -> Unit
) {
    if (state == NotificationPermissionState.Granted) return
    SummaryCard(title = "Reminders are off") {
        content {
            Text(text = explanationFor(state))
            if (state == NotificationPermissionState.NeedsSettings) {
                Button(onClick = onOpenSettings) { Text("Open notification settings") }
            } else {
                Button(onClick = onRequestPermission) { Text("Allow notifications") }
            }
        }
    }
}

internal fun explanationFor(state: NotificationPermissionState): String = when (state) {
    NotificationPermissionState.NotRequested ->
        "Allow notifications to be reminded before a planned task starts and when a timer runs long. " +
            "On the lock screen reminders only say that something needs your attention."
    NotificationPermissionState.DeniedCanRetry ->
        "Notifications are blocked, so Worktime can't remind you about planned tasks or running timers. " +
            "You can allow them now."
    NotificationPermissionState.NeedsSettings ->
        "Notifications are turned off for Worktime, so reminders can't appear. " +
            "Turn them back on in your device's notification settings."
    NotificationPermissionState.Granted -> ""
}

private fun currentNotificationPermissionState(
    context: Context,
    permissionRequested: Boolean
): NotificationPermissionState {
    val permissionGranted =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    val activity = context.findActivity()
    return resolveNotificationPermissionState(
        sdkInt = Build.VERSION.SDK_INT,
        permissionGranted = permissionGranted,
        notificationsEnabled = NotificationManagerCompat.from(context).areNotificationsEnabled(),
        permissionRequested = permissionRequested,
        shouldShowRationale =
        activity != null &&
            ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.POST_NOTIFICATIONS)
    )
}

private fun openNotificationSettings(context: Context) {
    val appNotificationSettings =
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
    val appDetails =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))
    try {
        context.startActivity(appNotificationSettings)
    } catch (_: ActivityNotFoundException) {
        // A few OEM builds lack the notification page; the app details page always exists.
        context.startActivity(appDetails)
    }
}

private tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
