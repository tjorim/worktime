package com.worktime.android.app
import android.content.ContextWrapper
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.worktime.android.app.navigation.WorktimeDestination
import com.worktime.android.core.auth.AuthErrorMessages
import com.worktime.android.core.auth.BiometricAuthenticator
import com.worktime.android.core.auth.SessionState
import com.worktime.android.core.notifications.ReminderScheduler
import com.worktime.android.core.notifications.WorktimeNotifications
import com.worktime.android.core.storage.BiometricLockPreferences
import com.worktime.android.core.storage.NotificationPreferences
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.feature.dashboard.DashboardViewModel
import com.worktime.android.feature.login.LoginScreen
import com.worktime.android.feature.nextshifts.NextShiftsScreen
import com.worktime.android.feature.session.BiometricGateScreen
import com.worktime.android.feature.session.BiometricGateViewModel
import com.worktime.android.feature.settings.SettingsScreen
import com.worktime.android.feature.teamstatus.TeamStatusScreen
import com.worktime.android.feature.timeoff.TimeOffFormState
import com.worktime.android.feature.timeoff.TimeOffSummaryScreen
import com.worktime.android.feature.timeoff.TimeOffUiState
import com.worktime.android.feature.timeoff.TimeOffViewModel
import com.worktime.android.feature.today.TodayScreen
import com.worktime.android.ui.theme.WorktimeTheme
import kotlinx.coroutines.launch

@Composable
fun WorktimeApp(container: WorktimeAppContainer, initialDestination: String = WorktimeDestination.Today.route) {
    val context = LocalContext.current
    val notifications = remember { WorktimeNotifications(context) }
    val reminderScheduler = remember { ReminderScheduler(context.applicationContext) }
    val sentSyncNotificationKeys = remember { mutableSetOf<String>() }

    val notificationPermissionLauncher =
        rememberLauncherForActivityResult(
            ActivityResultContracts.RequestPermission()
        ) { /* permission result handled silently; system manages notification access */ }

    LaunchedEffect(Unit) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(
                context,
                android.Manifest.permission.POST_NOTIFICATIONS
            ) != android.content.pm.PackageManager.PERMISSION_GRANTED
        ) {
            notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    val dashboardViewModel: DashboardViewModel =
        viewModel(
            factory = DashboardViewModel.factory(container.dashboardRepository)
        )
    val uiState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
    val actionsState by dashboardViewModel.actionsState.collectAsStateWithLifecycle()
    val timeOffViewModel: TimeOffViewModel =
        viewModel(
            factory = TimeOffViewModel.factory(container.dashboardRepository)
        )
    val timeOffUiState by timeOffViewModel.uiState.collectAsStateWithLifecycle()
    val timeOffFormState by timeOffViewModel.formState.collectAsStateWithLifecycle()
    val notificationPreferences by container.notificationPreferencesStore.preferences.collectAsStateWithLifecycle(
        initialValue = NotificationPreferences()
    )
    val apiBaseUrlOverride by container.apiBaseUrlOverrideStore.override.collectAsStateWithLifecycle(
        initialValue = null
    )

    val sessionState by container.sessionManager.sessionState.collectAsStateWithLifecycle()
    LaunchedEffect(sessionState, uiState, actionsState, notificationPreferences) {
        // Gate on sessionState (not just uiState) so a forced logout that hasn't yet propagated
        // to uiState can't race the cancelAll() effect below and re-arm a just-cancelled reminder.
        if (sessionState is SessionState.LoggedOut) return@LaunchedEffect
        val dashboard = (uiState as? DashboardUiState.Success)?.dashboard ?: return@LaunchedEffect
        reminderScheduler.reconcile(
            dashboard.identity.id,
            actionsState.plannedTask,
            actionsState.runningTask,
            notificationPreferences.plannedTasksEnabled,
            notificationPreferences.timeTrackingEnabled
        )

        if (notificationPreferences.syncConflictsEnabled) {
            actionsState.syncStatus?.let { status ->
                if (sentSyncNotificationKeys.add(status.serverTimestamp)) {
                    notifications.showSyncStatus("Sync checked at ${status.serverTimestamp}")
                }
            }
        }
    }
    LaunchedEffect(sessionState) {
        if (sessionState is SessionState.LoggedOut) reminderScheduler.cancelAll()
    }
    val coroutineScope = rememberCoroutineScope()
    var loginError by rememberSaveable { mutableStateOf<String?>(null) }
    var loginInFlight by rememberSaveable { mutableStateOf(false) }

    val biometricGateViewModel: BiometricGateViewModel =
        viewModel(factory = BiometricGateViewModel.factory(container.biometricLockPreferencesStore))
    val biometricLockPreferences by biometricGateViewModel.preferences.collectAsStateWithLifecycle()
    val isLocked by biometricGateViewModel.locked.collectAsStateWithLifecycle()
    var isBiometricPrompting by rememberSaveable { mutableStateOf(false) }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, biometricGateViewModel) {
        val observer =
            LifecycleEventObserver { _, event ->
                when (event) {
                    Lifecycle.Event.ON_STOP -> biometricGateViewModel.onAppBackgrounded(System.currentTimeMillis())
                    Lifecycle.Event.ON_START -> biometricGateViewModel.onAppResumed(System.currentTimeMillis())
                    else -> Unit
                }
            }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val loginLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            coroutineScope.launch {
                loginInFlight = false
                container.sessionManager
                    .handleAuthorizationResponse(result.data)
                    .onSuccess {
                        loginError = null
                        dashboardViewModel.refresh()
                        timeOffViewModel.refresh()
                    }.onFailure {
                        loginError =
                            (it as? IllegalStateException)?.message
                                ?: AuthErrorMessages.completeSignInError(context)
                    }
            }
        }

    // Fires whatever the end-session activity's outcome is (completed or cancelled): the
    // point is only to stop reporting "signed out" before the browser step has run, not to
    // gate sign-out on the provider's result.
    val logoutLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            dashboardViewModel.onLogoutFlowFinished()
        }

    LaunchedEffect(dashboardViewModel) {
        dashboardViewModel.logoutIntent.collect { intent -> logoutLauncher.launch(intent) }
    }

    WorktimeTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            if (isLocked && sessionState is SessionState.Authenticated) {
                val activity =
                    remember(context) {
                        var current = context
                        while (current is ContextWrapper && current !is FragmentActivity) {
                            current = current.baseContext
                        }
                        current as FragmentActivity
                    }
                val authenticator = remember(activity) { BiometricAuthenticator(activity) }
                val availability = remember(authenticator) { authenticator.checkAvailability() }
                BiometricGateScreen(
                    availability = availability,
                    isPrompting = isBiometricPrompting,
                    onUnlock = {
                        isBiometricPrompting = true
                        authenticator.authenticate(
                            onSuccess = {
                                isBiometricPrompting = false
                                biometricGateViewModel.onAuthenticationSucceeded()
                            },
                            onError = { isBiometricPrompting = false }
                        )
                    },
                    onContinueWithoutLock = biometricGateViewModel::onAuthenticationSucceeded
                )
            } else if (sessionState is SessionState.LoggedOut || uiState is DashboardUiState.LoggedOut) {
                LoginScreen(
                    sessionState = sessionState,
                    appConfig = container.appConfig,
                    isBusy = loginInFlight,
                    errorMessage = loginError,
                    onLogin = {
                        coroutineScope.launch {
                            loginInFlight = true
                            loginError = null
                            runCatching { container.sessionManager.createAuthorizationIntent() }
                                .onSuccess(loginLauncher::launch)
                                .onFailure {
                                    loginInFlight = false
                                    loginError = AuthErrorMessages.startSignInError(context)
                                }
                        }
                    }
                )
            } else {
                WorktimeAuthenticatedScaffold(
                    uiState = uiState,
                    actionsState = actionsState,
                    timeOffUiState = timeOffUiState,
                    timeOffFormState = timeOffFormState,
                    appConfig = container.appConfig,
                    oidcConfig = container.oidcConfig,
                    initialDestination = initialDestination,
                    notificationPreferences = notificationPreferences,
                    apiBaseUrlOverride = apiBaseUrlOverride,
                    onApiBaseUrlOverrideSave = { url ->
                        coroutineScope.launch {
                            container.apiBaseUrlOverrideStore.setOverride(url)
                            dashboardViewModel.refresh()
                        }
                    },
                    onApiBaseUrlOverrideClear = {
                        coroutineScope.launch {
                            container.apiBaseUrlOverrideStore.clearOverride()
                            dashboardViewModel.refresh()
                        }
                    },
                    onRetry = dashboardViewModel::refresh,
                    onLogout = dashboardViewModel::logout,
                    onDeleteAccount = dashboardViewModel::deleteAccount,
                    onStartTracking = dashboardViewModel::startTimeTracking,
                    onStopTracking = dashboardViewModel::stopTimeTracking,
                    onUpdateTask = dashboardViewModel::updateTask,
                    onSetWorkLocation = dashboardViewModel::setWorkLocation,
                    onDeleteWorkLocation = dashboardViewModel::deleteWorkLocation,
                    onUpdateWorkLocationPreferences = dashboardViewModel::updateWorkLocationPreferences,
                    onCreateLabel = dashboardViewModel::createLabel,
                    onRetryTimeOff = timeOffViewModel::refresh,
                    onAddTimeOff = timeOffViewModel::openCreateForm,
                    onEditTimeOff = timeOffViewModel::openEditForm,
                    onDismissTimeOffForm = timeOffViewModel::closeForm,
                    onSubmitTimeOff = timeOffViewModel::submit,
                    onDeleteTimeOff = timeOffViewModel::delete,
                    onPlannedTaskNotificationsChanged = {
                        coroutineScope.launch {
                            container.notificationPreferencesStore.setPlannedTasksEnabled(it)
                        }
                    },
                    onTimeTrackingNotificationsChanged = {
                        coroutineScope.launch {
                            container.notificationPreferencesStore.setTimeTrackingEnabled(it)
                        }
                    },
                    onSyncNotificationsChanged = {
                        coroutineScope.launch {
                            container.notificationPreferencesStore.setSyncConflictsEnabled(it)
                        }
                    },
                    biometricLockPreferences = biometricLockPreferences,
                    onBiometricLockEnabledChanged = biometricGateViewModel::setLockEnabled,
                    onBiometricIdleTimeoutChanged = biometricGateViewModel::setIdleTimeoutMinutes,
                    onUpdateLabel = dashboardViewModel::updateLabel,
                    onDeleteLabel = dashboardViewModel::deleteLabel,
                    onCreateTemplate = dashboardViewModel::createTemplate,
                    onUpdateTemplate = dashboardViewModel::updateTemplate,
                    onDeleteTemplate = dashboardViewModel::deleteTemplate
                )
            }
        }
    }
}

@Composable
private fun WorktimeAuthenticatedScaffold(
    uiState: DashboardUiState,
    actionsState: com.worktime.android.feature.dashboard.MobileActionsUiState,
    timeOffUiState: TimeOffUiState,
    timeOffFormState: TimeOffFormState,
    appConfig: com.worktime.android.core.config.AppConfig,
    oidcConfig: com.worktime.android.core.auth.OidcConfig,
    initialDestination: String,
    notificationPreferences: NotificationPreferences,
    apiBaseUrlOverride: String?,
    onApiBaseUrlOverrideSave: (String) -> Unit,
    onApiBaseUrlOverrideClear: () -> Unit,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
    onDeleteAccount: () -> Unit,
    onStartTracking: (String, String?) -> Unit,
    onStopTracking: (String) -> Unit,
    onUpdateTask: (String, String?, String?) -> Unit,
    onSetWorkLocation: (java.time.LocalDate, String, String?) -> Unit,
    onDeleteWorkLocation: (java.time.LocalDate) -> Unit,
    onUpdateWorkLocationPreferences: (String?, String?) -> Unit,
    onCreateLabel: (String, String) -> Unit,
    onRetryTimeOff: () -> Unit,
    onAddTimeOff: () -> Unit,
    onEditTimeOff: (String) -> Unit,
    onDismissTimeOffForm: () -> Unit,
    onSubmitTimeOff: (com.worktime.android.data.repository.TimeOffDraft) -> Unit,
    onDeleteTimeOff: (String) -> Unit,
    onPlannedTaskNotificationsChanged: (Boolean) -> Unit,
    onTimeTrackingNotificationsChanged: (Boolean) -> Unit,
    onSyncNotificationsChanged: (Boolean) -> Unit,
    biometricLockPreferences: BiometricLockPreferences,
    onBiometricLockEnabledChanged: (Boolean) -> Unit,
    onBiometricIdleTimeoutChanged: (Int) -> Unit,
    onUpdateLabel: (String, String, String) -> Unit,
    onDeleteLabel: (String) -> Unit,
    onCreateTemplate: (String, String?, java.time.LocalTime, java.time.LocalTime) -> Unit,
    onUpdateTemplate: (String, String, String?, java.time.LocalTime, java.time.LocalTime) -> Unit,
    onDeleteTemplate: (String) -> Unit
) {
    val navController = rememberNavController()
    val destinations = remember { WorktimeDestination.entries.toList() }
    val startDestination =
        destinations.firstOrNull { it.route == initialDestination }?.route
            ?: WorktimeDestination.Today.route
    val backStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = backStackEntry?.destination?.route ?: WorktimeDestination.Today.route

    Scaffold(
        bottomBar = {
            NavigationBar {
                destinations.forEach { destination ->
                    NavigationBarItem(
                        selected = currentRoute == destination.route,
                        onClick = {
                            navController.navigate(destination.route) {
                                launchSingleTop = true
                                restoreState = true
                                popUpTo(navController.graph.startDestinationId) {
                                    saveState = true
                                }
                            }
                        },
                        icon = {
                            Icon(
                                imageVector = destination.icon,
                                contentDescription = destination.label
                            )
                        },
                        label = { Text(destination.label) }
                    )
                }
            }
        }
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = startDestination,
            modifier = Modifier.fillMaxSize()
        ) {
            composable(WorktimeDestination.Today.route) {
                androidx.compose.foundation.layout.Box(modifier = Modifier.padding(paddingValues)) {
                    TodayScreen(
                        uiState = uiState,
                        actionsState = actionsState,
                        onRetry = onRetry,
                        onStartTracking = onStartTracking,
                        onStopTracking = onStopTracking,
                        onUpdateTask = onUpdateTask,
                        onSetWorkLocation = onSetWorkLocation,
                        onDeleteWorkLocation = onDeleteWorkLocation,
                        onCreateLabel = onCreateLabel
                    )
                }
            }
            composable(WorktimeDestination.NextShifts.route) {
                androidx.compose.foundation.layout.Box(modifier = Modifier.padding(paddingValues)) {
                    NextShiftsScreen(uiState = uiState, onRetry = onRetry)
                }
            }
            composable(WorktimeDestination.TeamStatus.route) {
                androidx.compose.foundation.layout.Box(modifier = Modifier.padding(paddingValues)) {
                    TeamStatusScreen(uiState = uiState, onRetry = onRetry)
                }
            }
            composable(WorktimeDestination.TimeOff.route) {
                androidx.compose.foundation.layout.Box(modifier = Modifier.padding(paddingValues)) {
                    TimeOffSummaryScreen(
                        uiState = timeOffUiState,
                        formState = timeOffFormState,
                        onRetry = onRetryTimeOff,
                        onAdd = onAddTimeOff,
                        onEdit = onEditTimeOff,
                        onDismissForm = onDismissTimeOffForm,
                        onSubmit = onSubmitTimeOff,
                        onDelete = onDeleteTimeOff
                    )
                }
            }
            composable(WorktimeDestination.Settings.route) {
                androidx.compose.foundation.layout.Box(modifier = Modifier.padding(paddingValues)) {
                    SettingsScreen(
                        uiState = uiState,
                        appConfig = appConfig,
                        oidcConfig = oidcConfig,
                        notificationPreferences = notificationPreferences,
                        apiBaseUrlOverride = apiBaseUrlOverride,
                        onApiBaseUrlOverrideSave = onApiBaseUrlOverrideSave,
                        onApiBaseUrlOverrideClear = onApiBaseUrlOverrideClear,
                        onPlannedTaskNotificationsChanged = onPlannedTaskNotificationsChanged,
                        onTimeTrackingNotificationsChanged = onTimeTrackingNotificationsChanged,
                        onSyncNotificationsChanged = onSyncNotificationsChanged,
                        biometricLockPreferences = biometricLockPreferences,
                        onBiometricLockEnabledChanged = onBiometricLockEnabledChanged,
                        onBiometricIdleTimeoutChanged = onBiometricIdleTimeoutChanged,
                        onLogout = onLogout,
                        isDeletingAccount = actionsState.isDeletingAccount,
                        deleteAccountError = actionsState.deleteAccountError,
                        onDeleteAccount = onDeleteAccount,
                        actionsState = actionsState,
                        onUpdateWorkLocationPreferences = onUpdateWorkLocationPreferences,
                        onCreateLabel = onCreateLabel,
                        onUpdateLabel = onUpdateLabel,
                        onDeleteLabel = onDeleteLabel,
                        onCreateTemplate = onCreateTemplate,
                        onUpdateTemplate = onUpdateTemplate,
                        onDeleteTemplate = onDeleteTemplate
                    )
                }
            }
        }
    }
}
