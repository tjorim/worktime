package com.worktime.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import com.worktime.android.feature.dashboard.MobileActionsUiState
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard
import java.time.LocalTime

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
    onDeleteAccount: () -> Unit = {},
    actionsState: MobileActionsUiState = MobileActionsUiState(),
    onUpdateWorkLocationPreferences: (String?, String?) -> Unit = { _, _ -> },
    onCreateLabel: (String, String) -> Unit = { _, _ -> },
    onUpdateLabel: (String, String, String) -> Unit = { _, _, _ -> },
    onDeleteLabel: (String) -> Unit = {},
    onCreateTemplate: (String, String?, LocalTime, LocalTime) -> Unit = { _, _, _, _ -> },
    onUpdateTemplate: (String, String, String?, LocalTime, LocalTime) -> Unit = { _, _, _, _, _ -> },
    onDeleteTemplate: (String) -> Unit = {}
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
            WorkLocationPreferencesCard(
                homeCountry = actionsState.workLocationPreferences.homeCountry.orEmpty(),
                officeCountry = actionsState.workLocationPreferences.officeCountry.orEmpty(),
                isSubmitting = actionsState.isSubmitting,
                onSave = onUpdateWorkLocationPreferences
            )
        }
        item {
            LabelManagementCard(
                labels = actionsState.labels,
                isSubmitting = actionsState.isSubmitting,
                onCreateLabel = onCreateLabel,
                onUpdateLabel = onUpdateLabel,
                onDeleteLabel = onDeleteLabel
            )
        }
        item {
            TemplateManagementCard(
                labels = actionsState.labels,
                templates = actionsState.templates,
                isSubmitting = actionsState.isSubmitting,
                onCreateTemplate = onCreateTemplate,
                onUpdateTemplate = onUpdateTemplate,
                onDeleteTemplate = onDeleteTemplate
            )
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
private fun WorkLocationPreferencesCard(
    homeCountry: String,
    officeCountry: String,
    isSubmitting: Boolean,
    onSave: (String?, String?) -> Unit
) {
    var home by rememberSaveable(homeCountry) { mutableStateOf(homeCountry) }
    var office by rememberSaveable(officeCountry) { mutableStateOf(officeCountry) }

    SummaryCard(title = "Work location defaults") {
        content {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = home,
                        onValueChange = { home = it.take(2).uppercase() },
                        label = { Text("Home") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                    OutlinedTextField(
                        value = office,
                        onValueChange = { office = it.take(2).uppercase() },
                        label = { Text("Office") },
                        singleLine = true,
                        modifier = Modifier.weight(1f)
                    )
                }
                Button(
                    onClick = { onSave(home.ifBlank { null }, office.ifBlank { null }) },
                    enabled = !isSubmitting && home.isValidCountryField() && office.isValidCountryField()
                ) {
                    Text("Save defaults")
                }
            }
        }
    }
}

private fun String.isValidCountryField(): Boolean = isBlank() || length == 2

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
                .menuAnchor(androidx.compose.material3.ExposedDropdownMenuAnchorType.PrimaryNotEditable, true)
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
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
