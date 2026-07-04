package com.worktime.android.feature.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.core.auth.SessionState
import com.worktime.android.core.config.AppConfig

@Composable
fun LoginScreen(
    sessionState: SessionState,
    appConfig: AppConfig,
    isBusy: Boolean,
    errorMessage: String?,
    onLogin: () -> Unit
) {
    Column(
        modifier =
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Worktime", style = MaterialTheme.typography.headlineMedium)
        Card(modifier = Modifier.padding(top = 16.dp)) {
            Column(
                modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text =
                    "Native Android companion app for the current shift, next shifts, " +
                        "team status, and time-off summary.",
                    style = MaterialTheme.typography.bodyLarge
                )
                Text(text = "Environment: ${appConfig.environment}")
                Text(text = "API: ${appConfig.apiBaseUrl}")
                Text(
                    text =
                    when (sessionState) {
                        SessionState.Initializing -> "Checking existing session…"
                        SessionState.LoggedOut -> "No active session"
                        is SessionState.Authenticated ->
                            if (sessionState.hasRefreshToken) "Session ready (refresh enabled)" else "Session ready"
                        is SessionState.Error -> sessionState.message
                    }
                )
                if (errorMessage != null) {
                    Text(text = errorMessage, color = MaterialTheme.colorScheme.error)
                }
                Button(onClick = onLogin, enabled = !isBusy) {
                    Text(if (isBusy) "Opening sign-in…" else "Sign in")
                }
            }
        }
    }
}
