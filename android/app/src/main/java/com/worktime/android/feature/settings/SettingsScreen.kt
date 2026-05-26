package com.worktime.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.core.config.AppConfig
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard

@Composable
fun SettingsScreen(
    uiState: DashboardUiState,
    appConfig: AppConfig,
    onLogout: () -> Unit,
) {
    ScreenList(title = "Settings") {
        item {
            SummaryCard(title = "Environment") {
                text("Flavor", appConfig.environment)
                text("API base URL", appConfig.apiBaseUrl)
                text("OIDC authority", appConfig.oidcAuthority)
                text("OIDC client ID", appConfig.oidcClientId)
                text("OIDC scope", appConfig.oidcScope)
            }
        }
        if (uiState is DashboardUiState.Success) {
            item {
                SummaryCard(title = "Authenticated user") {
                    text("Display name", uiState.dashboard.identity.displayName)
                    text("Username", uiState.dashboard.identity.username)
                    text("Admin", if (uiState.dashboard.identity.isAdmin) "Yes" else "No")
                }
            }
        }
        item {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(
                    text = "Switch environments with Gradle flavors or WORKTIME_ANDROID_* properties in CI/local builds.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Button(onClick = onLogout) {
                    Text("Sign out")
                }
            }
        }
    }
}
