package com.worktime.android.feature.settings

import android.content.ActivityNotFoundException
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.unit.dp
import com.worktime.android.core.auth.OidcConfig
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.config.WebEntryPoint
import com.worktime.android.core.storage.BiometricLockPreferences
import com.worktime.android.core.storage.NotificationPreferences
import com.worktime.android.data.model.Identity
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
fun AccountScreen(
    uiState: DashboardUiState,
    appConfig: AppConfig,
    oidcConfig: OidcConfig,
    notificationPreferences: NotificationPreferences,
    apiBaseUrlOverride: String?,
    onApiBaseUrlOverrideSave: (String) -> Unit,
    onApiBaseUrlOverrideClear: () -> Unit,
    onPlannedTaskNotificationsChanged: (Boolean) -> Unit,
    onTimeTrackingNotificationsChanged: (Boolean) -> Unit,
    onSyncNotificationsChanged: (Boolean) -> Unit,
    onOpenNotificationSettings: () -> Unit,
    biometricLockPreferences: BiometricLockPreferences,
    onBiometricLockEnabledChanged: (Boolean) -> Unit,
    onBiometricIdleTimeoutChanged: (Int) -> Unit,
    onLogout: () -> Unit
) {
    val uriHandler = LocalUriHandler.current
    var showChangelog by rememberSaveable { mutableStateOf(false) }
    var webOpenFailed by rememberSaveable { mutableStateOf(false) }
    val webBaseUrl = apiBaseUrlOverride ?: appConfig.apiBaseUrl
    val identity = (uiState as? DashboardUiState.Success)?.dashboard?.identity

    ScreenList(title = "Account") {
        if (identity != null) {
            item { SignedInCard(identity) }
        }
        item {
            WebManagementCard(
                showAdministration = identity?.isAdmin == true,
                openFailed = webOpenFailed,
                onOpen = { entryPoint ->
                    webOpenFailed = !uriHandler.tryOpenUri(entryPoint.url(webBaseUrl))
                }
            )
        }
        item {
            RemindersCard(
                preferences = notificationPreferences,
                onPlannedTasksChanged = onPlannedTaskNotificationsChanged,
                onTimeTrackingChanged = onTimeTrackingNotificationsChanged,
                onSyncChanged = onSyncNotificationsChanged,
                onOpenNotificationSettings = onOpenNotificationSettings
            )
        }
        item {
            AppLockCard(
                preferences = biometricLockPreferences,
                onLockEnabledChanged = onBiometricLockEnabledChanged,
                onIdleTimeoutChanged = onBiometricIdleTimeoutChanged
            )
        }
        item {
            EnvironmentCard(appConfig, oidcConfig, apiBaseUrlOverride, webBaseUrl)
        }
        item {
            ApiBaseUrlOverrideCard(
                appConfig = appConfig,
                apiBaseUrlOverride = apiBaseUrlOverride,
                onSave = onApiBaseUrlOverrideSave,
                onClear = onApiBaseUrlOverrideClear
            )
        }
        item {
            AccountActions(
                onShowChangelog = { showChangelog = true },
                onLogout = onLogout,
                onOpenPrivacyPolicy = { uriHandler.tryOpenUri(PRIVACY_POLICY_URL) }
            )
        }
    }

    if (showChangelog) {
        ChangelogDialog(onDismiss = { showChangelog = false })
    }
}

@Composable
private fun SignedInCard(identity: Identity) {
    SummaryCard(title = "Signed in") {
        text("Display name", identity.displayName)
        text("Username", identity.username)
    }
}

@Composable
private fun RemindersCard(
    preferences: NotificationPreferences,
    onPlannedTasksChanged: (Boolean) -> Unit,
    onTimeTrackingChanged: (Boolean) -> Unit,
    onSyncChanged: (Boolean) -> Unit,
    onOpenNotificationSettings: () -> Unit
) {
    SummaryCard(title = "Reminders") {
        Column(
            modifier =
            Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(modifier = Modifier.fillMaxWidth()) {
                Text("Planned tasks channel", modifier = Modifier.weight(1f))
                Switch(
                    checked = preferences.plannedTasksEnabled,
                    onCheckedChange = onPlannedTasksChanged
                )
            }
            Row(modifier = Modifier.fillMaxWidth()) {
                Text("Time tracking channel", modifier = Modifier.weight(1f))
                Switch(
                    checked = preferences.timeTrackingEnabled,
                    onCheckedChange = onTimeTrackingChanged
                )
            }
            Row(modifier = Modifier.fillMaxWidth()) {
                Text("Sync/conflicts channel", modifier = Modifier.weight(1f))
                Switch(
                    checked = preferences.syncConflictsEnabled,
                    onCheckedChange = onSyncChanged
                )
            }
            TextButton(onClick = onOpenNotificationSettings) {
                Text("Open notification settings")
            }
        }
    }
}

@Composable
private fun AppLockCard(
    preferences: BiometricLockPreferences,
    onLockEnabledChanged: (Boolean) -> Unit,
    onIdleTimeoutChanged: (Int) -> Unit
) {
    SummaryCard(title = "App lock") {
        content {
            Row(modifier = Modifier.fillMaxWidth()) {
                Text("Require unlock after idle", modifier = Modifier.weight(1f))
                Switch(
                    checked = preferences.lockEnabled,
                    onCheckedChange = onLockEnabledChanged
                )
            }
            Text(
                text =
                "Uses your device's biometric or screen-lock credential to re-confirm it's you " +
                    "after Worktime has been in the background past the idle timeout below.",
                style = MaterialTheme.typography.bodySmall
            )
            if (preferences.lockEnabled) {
                IdleTimeoutDropdown(
                    selectedMinutes = preferences.idleTimeoutMinutes,
                    onSelected = onIdleTimeoutChanged
                )
            }
        }
    }
}

@Composable
private fun EnvironmentCard(
    appConfig: AppConfig,
    oidcConfig: OidcConfig,
    apiBaseUrlOverride: String?,
    webBaseUrl: String
) {
    SummaryCard(title = "Environment") {
        text("Environment", appConfig.environment)
        text("API base URL", webBaseUrl)
        if (apiBaseUrlOverride != null) {
            text("Build default", appConfig.apiBaseUrl)
        }
        text("OIDC config", "${webBaseUrl.trimEnd('/')}/api/auth/oidc-config")
        text("OIDC client ID", oidcConfig.clientId)
        text("OIDC scope", oidcConfig.scope)
    }
}

private const val PRIVACY_POLICY_URL = "https://worktime.tjor.im/privacy"

@Composable
private fun AccountActions(onShowChangelog: () -> Unit, onLogout: () -> Unit, onOpenPrivacyPolicy: () -> Unit) {
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
        Button(onClick = onShowChangelog) {
            Text("What’s new")
        }
        Button(onClick = onLogout) {
            Text("Sign out")
        }
        Button(onClick = onOpenPrivacyPolicy) {
            Text("Privacy policy")
        }
    }
}

/** Time off, settings and administration live on the web; this card is the way there. */
@Composable
internal fun WebManagementCard(showAdministration: Boolean, openFailed: Boolean, onOpen: (WebEntryPoint) -> Unit) {
    SummaryCard(title = "Manage on the web") {
        content {
            Text(
                text =
                "Time off, work location defaults, labels, templates, settings and account deletion " +
                    "are managed in Worktime on the web.",
                style = MaterialTheme.typography.bodySmall
            )
            Button(onClick = { onOpen(WebEntryPoint.TimeOff) }) { Text("Manage time off") }
            Button(onClick = { onOpen(WebEntryPoint.Settings) }) { Text("Open settings") }
            if (showAdministration) {
                Button(onClick = { onOpen(WebEntryPoint.Administration) }) { Text("Open administration") }
            }
            if (openFailed) {
                Text(
                    text = "No app on this device could open the web page.",
                    color = MaterialTheme.colorScheme.error,
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
    }
}

/** Opens [url] and reports whether a handler existed, rather than crashing on a device without a browser. */
private fun UriHandler.tryOpenUri(url: String): Boolean = try {
    openUri(url)
    true
} catch (_: ActivityNotFoundException) {
    false
} catch (_: IllegalArgumentException) {
    false
}

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
