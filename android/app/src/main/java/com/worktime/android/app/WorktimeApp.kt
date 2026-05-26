package com.worktime.android.app

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.worktime.android.app.navigation.WorktimeDestination
import com.worktime.android.core.auth.SessionState
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.feature.dashboard.DashboardViewModel
import com.worktime.android.feature.login.LoginScreen
import com.worktime.android.feature.nextshifts.NextShiftsScreen
import com.worktime.android.feature.settings.SettingsScreen
import com.worktime.android.feature.teamstatus.TeamStatusScreen
import com.worktime.android.feature.timeoff.TimeOffSummaryScreen
import com.worktime.android.feature.today.TodayScreen
import com.worktime.android.ui.theme.WorktimeTheme
import kotlinx.coroutines.launch

@Composable
fun WorktimeApp(container: WorktimeAppContainer) {
    val dashboardViewModel: DashboardViewModel = viewModel(
        factory = DashboardViewModel.factory(container.dashboardRepository),
    )
    val uiState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
    val sessionState by container.sessionManager.sessionState.collectAsStateWithLifecycle()
    val coroutineScope = rememberCoroutineScope()
    var loginError by rememberSaveable { mutableStateOf<String?>(null) }
    var loginInFlight by rememberSaveable { mutableStateOf(false) }

    val loginLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        coroutineScope.launch {
            loginInFlight = false
            container.sessionManager.handleAuthorizationResponse(result.data)
                .onSuccess {
                    loginError = null
                    dashboardViewModel.refresh()
                }
                .onFailure {
                    loginError = it.message ?: "Unable to complete sign-in"
                }
        }
    }

    WorktimeTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            if (sessionState is SessionState.LoggedOut || uiState is DashboardUiState.LoggedOut) {
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
                                    loginError = it.message ?: "Unable to start sign-in"
                                }
                        }
                    },
                )
            } else {
                WorktimeAuthenticatedScaffold(
                    uiState = uiState,
                    appConfig = container.appConfig,
                    onRetry = dashboardViewModel::refresh,
                    onLogout = dashboardViewModel::logout,
                )
            }
        }
    }
}

@Composable
private fun WorktimeAuthenticatedScaffold(
    uiState: DashboardUiState,
    appConfig: com.worktime.android.core.config.AppConfig,
    onRetry: () -> Unit,
    onLogout: () -> Unit,
) {
    val navController = rememberNavController()
    val destinations = remember { WorktimeDestination.entries.toList() }
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
                        icon = { Text(destination.emoji) },
                        label = { Text(destination.label) },
                    )
                }
            }
        },
    ) { paddingValues ->
        NavHost(
            navController = navController,
            startDestination = WorktimeDestination.Today.route,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(WorktimeDestination.Today.route) {
                androidx.compose.foundation.layout.Box(modifier = Modifier.padding(paddingValues)) {
                    TodayScreen(uiState = uiState, onRetry = onRetry)
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
                    TimeOffSummaryScreen(uiState = uiState, onRetry = onRetry)
                }
            }
            composable(WorktimeDestination.Settings.route) {
                androidx.compose.foundation.layout.Box(modifier = Modifier.padding(paddingValues)) {
                    SettingsScreen(uiState = uiState, appConfig = appConfig, onLogout = onLogout)
                }
            }
        }
    }
}
