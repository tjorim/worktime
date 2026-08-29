package com.worktime.android.app

import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.worktime.android.core.auth.SessionState
import com.worktime.android.core.notifications.ReminderScheduler
import com.worktime.android.core.notifications.WorktimeNotifications
import com.worktime.android.core.notifications.registerFcmTokenIfNeeded
import com.worktime.android.core.storage.NotificationPreferences
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.feature.dashboard.DashboardViewModel
import com.worktime.android.feature.session.BiometricGateViewModel

/** Owns app-level integrations that do not render UI. */
@Composable
internal fun WorktimeAppEffects(
    container: WorktimeAppContainer,
    dashboardViewModel: DashboardViewModel,
    biometricGateViewModel: BiometricGateViewModel,
    sessionState: SessionState
) {
    RequestNotificationPermission()
    ReconcileNotifications(container, dashboardViewModel, sessionState)
    LaunchedEffect(sessionState) {
        if (sessionState is SessionState.Authenticated) registerFcmTokenIfNeeded(container)
    }
    ObserveAppLifecycle(dashboardViewModel, biometricGateViewModel)
}

@Composable
private fun RequestNotificationPermission() {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {}
    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, android.Manifest.permission.POST_NOTIFICATIONS) !=
            android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            launcher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}

@Composable
private fun ReconcileNotifications(
    container: WorktimeAppContainer,
    viewModel: DashboardViewModel,
    sessionState: SessionState
) {
    val context = LocalContext.current
    val notifications = remember { WorktimeNotifications(context) }
    val scheduler = remember { ReminderScheduler(context.applicationContext) }
    val sentSyncKeys = remember { mutableStateOf(emptySet<String>()) }
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val actionsState by viewModel.actionsState.collectAsStateWithLifecycle()
    val preferences by container.notificationPreferencesStore.preferences.collectAsStateWithLifecycle(
        initialValue = NotificationPreferences()
    )
    LaunchedEffect(sessionState, uiState, actionsState, preferences) {
        // Prevent a forced logout racing cancellation and re-arming a reminder.
        if (sessionState is SessionState.LoggedOut) return@LaunchedEffect
        val dashboard = (uiState as? DashboardUiState.Success)?.dashboard ?: return@LaunchedEffect
        scheduler.reconcile(
            dashboard.identity.id,
            actionsState.plannedTask,
            actionsState.runningTask,
            preferences.plannedTasksEnabled,
            preferences.timeTrackingEnabled
        )
        val status = actionsState.syncStatus
        if (preferences.syncConflictsEnabled && status != null && status.serverTimestamp !in sentSyncKeys.value) {
            sentSyncKeys.value += status.serverTimestamp
            notifications.showSyncStatus("Sync checked at ${status.serverTimestamp}")
        }
    }
    LaunchedEffect(sessionState) {
        if (sessionState is SessionState.LoggedOut) scheduler.cancelAll()
    }
}

@Composable
private fun ObserveAppLifecycle(
    dashboardViewModel: DashboardViewModel,
    biometricGateViewModel: BiometricGateViewModel
) {
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, dashboardViewModel, biometricGateViewModel) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> {
                    biometricGateViewModel.onAppResumed(System.currentTimeMillis())
                    dashboardViewModel.onAppForegrounded()
                }
                Lifecycle.Event.ON_STOP -> {
                    biometricGateViewModel.onAppBackgrounded(System.currentTimeMillis())
                    dashboardViewModel.onAppBackgrounded()
                }
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }
}
