package com.worktime.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import com.worktime.android.core.auth.OidcConfig
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.storage.BiometricLockPreferences
import com.worktime.android.core.storage.NotificationPreferences
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard

private const val IDLE_TIMEOUT_OPTION_1_MIN = 1
private const val IDLE_TIMEOUT_OPTION_5_MIN = 5
private const val IDLE_TIMEOUT_OPTION_15_MIN = 15
private const val IDLE_TIMEOUT_OPTION_30_MIN = 30
private val IDLE_TIMEOUT_OPTIONS_MINUTES =
    listOf(IDLE_TIMEOUT_OPTION_1_MIN, IDLE_TIMEOUT_OPTION_5_MIN, IDLE_TIMEOUT_OPTION_15_MIN, IDLE_TIMEOUT_OPTION_30_MIN)

@Composable
fun SettingsScreen(
    uiState: DashboardUiState,
    appConfig: AppConfig,
    oidcConfig: OidcConfig,
    notificationPreferences: NotificationPreferences,
    apiBaseUrlOverride: String?,
    onApiBaseUrlOverrideSave: (String) -> Unit,
    onApiBaseUrlOverrideClear: () -> Unit,
    onShiftNotificationsChanged: (Boolean) -> Unit,
    onTimeTrackingNotificationsChanged: (Boolean) -> Unit,
    onSyncNotificationsChanged: (Boolean) -> Unit,
    biometricLockPreferences: BiometricLockPreferences,
    onBiometricLockEnabledChanged: (Boolean) -> Unit,
    onBiometricIdleTimeoutChanged: (Int) -> Unit,
    onLogout: () -> Unit,
    isDeletingAccount: Boolean = false,
    deleteAccountError: String? = null,
    onDeleteAccount: () -> Unit = {}
) {
    val uriHandler = LocalUriHandler.current
    var showDeleteAccountConfirm by rememberSaveable { mutableStateOf(false) }

    ScreenList(title = "Settings") {
        item {
            SummaryCard(title = "Environment") {
                text("Environment", appConfig.environment)
                text("API base URL", apiBaseUrlOverride ?: appConfig.apiBaseUrl)
                if (apiBaseUrlOverride != null) {
                    text("Build default", appConfig.apiBaseUrl)
                }
                text("OIDC config", "${(apiBaseUrlOverride ?: appConfig.apiBaseUrl).trimEnd('/')}/api/auth/oidc-config")
                text("OIDC client ID", oidcConfig.clientId)
                text("OIDC scope", oidcConfig.scope)
            }
        }
        item {
            ApiBaseUrlOverrideCard(
                appConfig = appConfig,
                apiBaseUrlOverride = apiBaseUrlOverride,
                onSave = onApiBaseUrlOverrideSave,
                onClear = onApiBaseUrlOverrideClear
            )
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
            SummaryCard(title = "Notifications") {
                Column(
                    modifier =
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    androidx.compose.foundation.layout.Row(modifier = Modifier.fillMaxWidth()) {
                        Text("Shifts channel", modifier = Modifier.weight(1f))
                        Switch(
                            checked = notificationPreferences.shiftsEnabled,
                            onCheckedChange = onShiftNotificationsChanged
                        )
                    }
                    androidx.compose.foundation.layout.Row(modifier = Modifier.fillMaxWidth()) {
                        Text("Time tracking channel", modifier = Modifier.weight(1f))
                        Switch(
                            checked = notificationPreferences.timeTrackingEnabled,
                            onCheckedChange = onTimeTrackingNotificationsChanged
                        )
                    }
                    androidx.compose.foundation.layout.Row(modifier = Modifier.fillMaxWidth()) {
                        Text("Sync/conflicts channel", modifier = Modifier.weight(1f))
                        Switch(
                            checked = notificationPreferences.syncConflictsEnabled,
                            onCheckedChange = onSyncNotificationsChanged
                        )
                    }
                }
            }
        }
        item {
            SummaryCard(title = "App lock") {
                content {
                    Row(modifier = Modifier.fillMaxWidth()) {
                        Text("Require unlock after idle", modifier = Modifier.weight(1f))
                        Switch(
                            checked = biometricLockPreferences.lockEnabled,
                            onCheckedChange = onBiometricLockEnabledChanged
                        )
                    }
                    Text(
                        text =
                        "Uses your device's biometric or screen-lock credential to re-confirm it's you " +
                            "after Worktime has been in the background past the idle timeout below.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    if (biometricLockPreferences.lockEnabled) {
                        IdleTimeoutDropdown(
                            selectedMinutes = biometricLockPreferences.idleTimeoutMinutes,
                            onSelected = onBiometricIdleTimeoutChanged
                        )
                    }
                }
            }
        }
        item {
            Column(
                modifier =
                Modifier
                    .fillMaxSize()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text =
                    "Switch environments with Gradle build variants or ANDROID_* properties in CI/local builds, " +
                        "or set a runtime API override above.",
                    style = MaterialTheme.typography.bodyMedium
                )
                Button(onClick = onLogout) {
                    Text("Sign out")
                }
                Button(onClick = { uriHandler.openUri(PRIVACY_POLICY_URL) }) {
                    Text("Privacy policy")
                }
                Button(onClick = { uriHandler.openUri(PRIVACY_POLICY_URL) }) {
                    Text("Privacy and deletion options")
                }
            }
        }
        item {
            SummaryCard(title = "Danger zone") {
                content {
                    Text(
                        text = "Permanently delete your account and all synced Worktime data. This cannot be undone.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    if (deleteAccountError != null) {
                        Text(
                            text = deleteAccountError,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodySmall
                        )
                    }
                    Button(
                        onClick = { showDeleteAccountConfirm = true },
                        enabled = !isDeletingAccount,
                        colors = androidx.compose.material3.ButtonDefaults.buttonColors(
                            containerColor = MaterialTheme.colorScheme.error
                        )
                    ) {
                        Text(if (isDeletingAccount) "Deleting…" else "Delete my account")
                    }
                }
            }
        }
    }

    if (showDeleteAccountConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteAccountConfirm = false },
            title = { Text("Delete your account?") },
            text = {
                Text(
                    "This will permanently delete your account and all synced Worktime data. " +
                        "This action cannot be undone."
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        showDeleteAccountConfirm = false
                        onDeleteAccount()
                    }
                ) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteAccountConfirm = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

private const val PRIVACY_POLICY_URL = "https://worktime.tjor.im/privacy"

@Composable
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
private fun IdleTimeoutDropdown(selectedMinutes: Int, onSelected: (Int) -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = "$selectedMinutes min",
            onValueChange = {},
            readOnly = true,
            label = { Text("Idle timeout") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier = Modifier
                .fillMaxWidth()
                .menuAnchor(androidx.compose.material3.MenuAnchorType.PrimaryNotEditable, true)
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            IDLE_TIMEOUT_OPTIONS_MINUTES.forEach { minutes ->
                DropdownMenuItem(
                    text = { Text("$minutes min") },
                    onClick = {
                        onSelected(minutes)
                        expanded = false
                    }
                )
            }
        }
    }
}
