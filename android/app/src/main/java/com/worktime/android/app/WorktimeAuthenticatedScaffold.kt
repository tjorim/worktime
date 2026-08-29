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
import com.worktime.android.feature.settings.SettingsScreen
import com.worktime.android.feature.teamstatus.TeamStatusScreen
import com.worktime.android.feature.timeoff.TimeOffSummaryScreen
import com.worktime.android.feature.timeoff.TimeOffViewModel
import com.worktime.android.feature.today.TodayScreen
import kotlinx.coroutines.launch

@Composable
internal fun WorktimeAuthenticatedScaffold(
    container: WorktimeAppContainer,
    dashboardViewModel: DashboardViewModel,
    timeOffViewModel: TimeOffViewModel,
    biometricGateViewModel: BiometricGateViewModel,
    initialDestination: String,
    pendingDestination: String?,
    onPendingDestinationConsumed: () -> Unit
) {
    val navController = rememberNavController()
    val destinations = remember { WorktimeDestination.entries.toList() }
    val startDestination = destinations.firstOrNull { it.route == initialDestination }?.route
        ?: WorktimeDestination.Today.route
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route ?: WorktimeDestination.Today.route

    LaunchedEffect(pendingDestination, navController) {
        val destination = pendingDestination ?: return@LaunchedEffect
        if (destinations.any { it.route == destination }) {
            navController.navigate(destination) {
                launchSingleTop = true
                restoreState = true
                popUpTo(navController.graph.startDestinationId) { saveState = true }
            }
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
                    TodayDestination(dashboardViewModel)
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
            composable(WorktimeDestination.TimeOff.route) {
                Box(Modifier.padding(paddingValues)) {
                    TimeOffDestination(timeOffViewModel)
                }
            }
            composable(WorktimeDestination.Settings.route) {
                Box(Modifier.padding(paddingValues)) {
                    SettingsDestination(container, dashboardViewModel, biometricGateViewModel)
                }
            }
        }
    }
}

@Composable
private fun WorktimeBottomBar(
    destinations: List<WorktimeDestination>,
    currentRoute: String,
    onNavigate: (String) -> Unit
) {
    NavigationBar {
        destinations.forEach { destination ->
            NavigationBarItem(
                selected = currentRoute == destination.route,
                onClick = { onNavigate(destination.route) },
                icon = { Icon(destination.icon, contentDescription = destination.label) },
                label = { Text(destination.label) }
            )
        }
    }
}

@Composable
private fun TodayDestination(viewModel: DashboardViewModel) {
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
        onCreateLabel = viewModel::createLabel
    )
}

@Composable
private fun TimeOffDestination(viewModel: TimeOffViewModel) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val formState by viewModel.formState.collectAsStateWithLifecycle()
    TimeOffSummaryScreen(
        uiState = uiState,
        formState = formState,
        onRetry = viewModel::refresh,
        onAdd = viewModel::openCreateForm,
        onEdit = viewModel::openEditForm,
        onDismissForm = viewModel::closeForm,
        onSubmit = viewModel::submit,
        onDelete = viewModel::delete
    )
}

@Composable
private fun SettingsDestination(
    container: WorktimeAppContainer,
    dashboardViewModel: DashboardViewModel,
    biometricGateViewModel: BiometricGateViewModel
) {
    val uiState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
    val actionsState by dashboardViewModel.actionsState.collectAsStateWithLifecycle()
    val notifications by container.notificationPreferencesStore.preferences.collectAsStateWithLifecycle(
        initialValue = NotificationPreferences()
    )
    val apiBaseUrlOverride by container.apiBaseUrlOverrideStore.override.collectAsStateWithLifecycle(
        initialValue = null
    )
    val biometricPreferences by biometricGateViewModel.preferences.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()

    SettingsScreen(
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
        onLogout = dashboardViewModel::logout,
        isDeletingAccount = actionsState.isDeletingAccount,
        deleteAccountError = actionsState.deleteAccountError,
        onDeleteAccount = dashboardViewModel::deleteAccount,
        actionsState = actionsState,
        onUpdateWorkLocationPreferences = dashboardViewModel::updateWorkLocationPreferences,
        onCreateLabel = dashboardViewModel::createLabel,
        onUpdateLabel = dashboardViewModel::updateLabel,
        onDeleteLabel = dashboardViewModel::deleteLabel,
        onCreateTemplate = dashboardViewModel::createTemplate,
        onUpdateTemplate = dashboardViewModel::updateTemplate,
        onDeleteTemplate = dashboardViewModel::deleteTemplate
    )
}
