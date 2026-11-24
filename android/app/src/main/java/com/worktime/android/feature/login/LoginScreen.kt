package com.worktime.android.feature.login

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.worktime.android.core.auth.SessionState
import com.worktime.android.core.config.AppConfig
import com.worktime.android.ui.components.CenteredScrollPane

@Composable
fun LoginScreen(
    sessionState: SessionState,
    appConfig: AppConfig,
    isBusy: Boolean,
    errorMessage: String?,
    onLogin: () -> Unit
) {
    CenteredScrollPane(contentPadding = 24.dp) {
        Text(
            text = "Worktime",
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.headlineMedium
        )
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
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
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
                    Text(
                        text = errorMessage,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                        color = MaterialTheme.colorScheme.error
                    )
                }
                Button(onClick = onLogin, enabled = !isBusy) {
                    Text(if (isBusy) "Opening sign-in…" else "Sign in")
                }
            }
        }
    }
}
