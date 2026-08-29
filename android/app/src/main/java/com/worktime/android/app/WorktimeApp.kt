package com.worktime.android.app

import android.content.ContextWrapper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import com.worktime.android.app.navigation.WorktimeDestination
import com.worktime.android.core.auth.AuthErrorMessages
import com.worktime.android.core.auth.BiometricAuthenticator
import com.worktime.android.core.auth.SessionState
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.feature.dashboard.DashboardViewModel
import com.worktime.android.feature.login.LoginScreen
import com.worktime.android.feature.session.BiometricGateScreen
import com.worktime.android.feature.session.BiometricGateViewModel
import com.worktime.android.feature.timeoff.TimeOffViewModel
import com.worktime.android.ui.theme.WorktimeTheme
import kotlinx.coroutines.launch

@Composable
fun WorktimeApp(
    container: WorktimeAppContainer,
    initialDestination: String = WorktimeDestination.Today.route,
    pendingDestination: String? = null,
    onPendingDestinationConsumed: () -> Unit = {}
) {
    val dashboardViewModel: DashboardViewModel =
        viewModel(
            factory =
            DashboardViewModel.factory(
                container.dashboardRepository,
                container.connectivityObserver,
                container.syncSignalTransport
            )
        )
    val timeOffViewModel: TimeOffViewModel =
        viewModel(factory = TimeOffViewModel.factory(container.dashboardRepository))
    val biometricGateViewModel: BiometricGateViewModel =
        viewModel(factory = BiometricGateViewModel.factory(container.biometricLockPreferencesStore))
    val sessionState by container.sessionManager.sessionState.collectAsStateWithLifecycle()
    val dashboardState by dashboardViewModel.uiState.collectAsStateWithLifecycle()
    val isLocked by biometricGateViewModel.locked.collectAsStateWithLifecycle()

    WorktimeAppEffects(container, dashboardViewModel, biometricGateViewModel, sessionState)
    ObserveLogoutRequests(dashboardViewModel)

    WorktimeTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when {
                isLocked && sessionState is SessionState.Authenticated ->
                    BiometricGate(biometricGateViewModel)
                sessionState is SessionState.LoggedOut || dashboardState is DashboardUiState.LoggedOut ->
                    LoginDestination(container, dashboardViewModel, timeOffViewModel, sessionState)
                else ->
                    WorktimeAuthenticatedScaffold(
                        container = container,
                        dashboardViewModel = dashboardViewModel,
                        timeOffViewModel = timeOffViewModel,
                        biometricGateViewModel = biometricGateViewModel,
                        initialDestination = initialDestination,
                        pendingDestination = pendingDestination,
                        onPendingDestinationConsumed = onPendingDestinationConsumed
                    )
            }
        }
    }
}

@Composable
private fun LoginDestination(
    container: WorktimeAppContainer,
    dashboardViewModel: DashboardViewModel,
    timeOffViewModel: TimeOffViewModel,
    sessionState: SessionState
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var loginError by rememberSaveable { mutableStateOf<String?>(null) }
    var loginInFlight by rememberSaveable { mutableStateOf(false) }
    val loginLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            scope.launch {
                loginInFlight = false
                container.sessionManager.handleAuthorizationResponse(result.data)
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
    LoginScreen(
        sessionState = sessionState,
        appConfig = container.appConfig,
        isBusy = loginInFlight,
        errorMessage = loginError,
        onLogin = {
            scope.launch {
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
}

@Composable
private fun ObserveLogoutRequests(viewModel: DashboardViewModel) {
    val launcher =
        rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
            viewModel.onLogoutFlowFinished()
        }
    LaunchedEffect(viewModel) {
        viewModel.logoutIntent.collect(launcher::launch)
    }
}

@Composable
private fun BiometricGate(viewModel: BiometricGateViewModel) {
    val context = LocalContext.current
    var isPrompting by rememberSaveable { mutableStateOf(false) }
    val activity =
        remember(context) {
            var current = context
            while (current is ContextWrapper && current !is FragmentActivity) current = current.baseContext
            current as FragmentActivity
        }
    val authenticator = remember(activity) { BiometricAuthenticator(activity) }
    val availability = remember(authenticator) { authenticator.checkAvailability() }

    BiometricGateScreen(
        availability = availability,
        isPrompting = isPrompting,
        onUnlock = {
            isPrompting = true
            authenticator.authenticate(
                onSuccess = {
                    isPrompting = false
                    viewModel.onAuthenticationSucceeded()
                },
                onError = { isPrompting = false }
            )
        },
        onContinueWithoutLock = viewModel::onAuthenticationSucceeded
    )
}
