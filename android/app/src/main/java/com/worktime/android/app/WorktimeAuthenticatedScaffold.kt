package com.worktime.android.app

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.worktime.android.app.navigation.WorktimeDestination
import com.worktime.android.core.storage.NotificationPreferences
import com.worktime.android.feature.dashboard.DashboardViewModel
import com.worktime.android.feature.nextshifts.NextShiftsScreen
import com.worktime.android.feature.session.BiometricGateViewModel
import com.worktime.android.feature.settings.AccountScreen
import com.worktime.android.feature.teamstatus.TeamStatusScreen
import com.worktime.android.feature.today.TodayScreen
import com.worktime.android.ui.components.NotificationPermissionCard
import com.worktime.android.ui.components.openNotificationSettings
import kotlinx.coroutines.launch

@Composable
internal fun WorktimeAuthenticatedScaffold(
    container: WorktimeAppContainer,
    dashboardViewModel: DashboardViewModel,
    biometricGateViewModel: BiometricGateViewModel,
    initialDestination: String,
    pendingDestination: String?,
    onPendingDestinationConsumed: () -> Unit
) {
    val navController = rememberNavController()
    val destinations = remember { WorktimeDestination.entries.toList() }
    val startDestination = WorktimeDestination.fromRoute(initialDestination).route
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route ?: WorktimeDestination.Today.route

    LaunchedEffect(pendingDestination, navController) {
        val destination = pendingDestination ?: return@LaunchedEffect
        navController.navigate(WorktimeDestination.fromRoute(destination).route) {
            launchSingleTop = true
            restoreState = true
            popUpTo(navController.graph.startDestinationId) { saveState = true }
        }
        onPendingDestinationConsumed()
    }

    Scaffold(
        bottomBar = {
            WorktimeBottomBar(destinations, currentRoute) {
                navController.navigate(it) {
                    launchSingleTop = true
                    restoreState = true
                    popUpTo(navController.graph.startDestinationId) { saveState = true }
                }
            }
        }
    ) { paddingValues ->
        NavHost(navController, startDestination, Modifier.fillMaxSize()) {
            composable(WorktimeDestination.Today.route) {
                Box(Modifier.padding(paddingValues)) {
                    TodayDestination(container, dashboardViewModel)
                }
            }
            composable(WorktimeDestination.NextShifts.route) {
                Box(Modifier.padding(paddingValues)) {
                    val uiState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
                    NextShiftsScreen(uiState, dashboardViewModel::refresh)
                }
            }
            composable(WorktimeDestination.TeamStatus.route) {
                Box(Modifier.padding(paddingValues)) {
                    val uiState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
                    TeamStatusScreen(uiState, dashboardViewModel::refresh)
                }
            }
            composable(WorktimeDestination.Account.route) {
                Box(Modifier.padding(paddingValues)) {
                    AccountDestination(container, dashboardViewModel, biometricGateViewModel)
                }
            }
        }
    }
}

@Composable
internal fun WorktimeBottomBar(
    destinations: List<WorktimeDestination>,
    currentRoute: String,
    onNavigate: (String) -> Unit
) {
    NavigationBar {
        destinations.forEach { destination ->
            NavigationBarItem(
                selected = currentRoute == destination.route,
                onClick = { onNavigate(destination.route) },
                // Decorative: the visible label already names the tab, so a description would be read twice.
                icon = { Icon(destination.icon, contentDescription = null) },
                label = { Text(destination.label) }
            )
        }
    }
}

@Composable
private fun TodayDestination(container: WorktimeAppContainer, viewModel: DashboardViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val actionsState by viewModel.actionsState.collectAsStateWithLifecycle()
    TodayScreen(
        uiState = uiState,
        actionsState = actionsState,
        onRetry = viewModel::refresh,
        onStartTracking = viewModel::startTimeTracking,
        onStopTracking = viewModel::stopTimeTracking,
        onUpdateTask = viewModel::updateTask,
        onSetWorkLocation = viewModel::setWorkLocation,
        onDeleteWorkLocation = viewModel::deleteWorkLocation,
        onCreateLabel = viewModel::createLabel,
        reminderPermissionPrompt = { ReminderPermissionPrompt(container) }
    )
}

@Composable
private fun AccountDestination(
    container: WorktimeAppContainer,
    dashboardViewModel: DashboardViewModel,
    biometricGateViewModel: BiometricGateViewModel
) {
    val uiState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val notifications by container.notificationPreferencesStore.preferences.collectAsStateWithLifecycle(
        initialValue = NotificationPreferences()
    )
    val apiBaseUrlOverride by container.apiBaseUrlOverrideStore.override.collectAsStateWithLifecycle(
        initialValue = null
    )
    val biometricPreferences by biometricGateViewModel.preferences.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    AccountScreen(
        uiState = uiState,
        appConfig = container.appConfig,
        oidcConfig = container.oidcConfig,
        notificationPreferences = notifications,
        apiBaseUrlOverride = apiBaseUrlOverride,
        onApiBaseUrlOverrideSave = { url ->
            scope.launch {
                container.apiBaseUrlOverrideStore.setOverride(url)
                dashboardViewModel.refresh()
            }
        },
        onApiBaseUrlOverrideClear = {
            scope.launch {
                container.apiBaseUrlOverrideStore.clearOverride()
                dashboardViewModel.refresh()
            }
        },
        onPlannedTaskNotificationsChanged = { enabled ->
            scope.launch { container.notificationPreferencesStore.setPlannedTasksEnabled(enabled) }
        },
        onTimeTrackingNotificationsChanged = { enabled ->
            scope.launch { container.notificationPreferencesStore.setTimeTrackingEnabled(enabled) }
        },
        onSyncNotificationsChanged = { enabled ->
            scope.launch { container.notificationPreferencesStore.setSyncConflictsEnabled(enabled) }
        },
        biometricLockPreferences = biometricPreferences,
        onBiometricLockEnabledChanged = biometricGateViewModel::setLockEnabled,
        onBiometricIdleTimeoutChanged = biometricGateViewModel::setIdleTimeoutMinutes,
        onOpenNotificationSettings = { openNotificationSettings(context) },
        onLogout = dashboardViewModel::logout
    )
}

/** Prompts for the notification permission only while a reminder is switched on and would need it. */
@Composable
private fun ReminderPermissionPrompt(container: WorktimeAppContainer) {
    val notifications by container.notificationPreferencesStore.preferences.collectAsStateWithLifecycle(
        initialValue = NotificationPreferences()
    )
    val scope = rememberCoroutineScope()
    val anyReminderEnabled =
        notifications.plannedTasksEnabled || notifications.timeTrackingEnabled || notifications.syncConflictsEnabled
    if (anyReminderEnabled) {
        NotificationPermissionCard(
            permissionRequested = notifications.permissionRequested,
            onPermissionRequested = {
                scope.launch { container.notificationPreferencesStore.markPermissionRequested() }
            }
        )
    }
}
