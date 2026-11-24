package com.worktime.android.feature.settings

import android.net.Uri
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import com.worktime.android.core.auth.OidcConfig
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.config.WebEntryPoint
import com.worktime.android.core.storage.BiometricLockPreferences
import com.worktime.android.core.storage.NotificationPreferences
import com.worktime.android.feature.dashboard.DashboardUiState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class AccountScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun renderAccount(onLogout: () -> Unit = {}, onOpenNotificationSettings: () -> Unit = {}) {
        composeTestRule.setContent {
            MaterialTheme {
                AccountScreen(
                    uiState = DashboardUiState.Loading,
                    appConfig = AppConfig("test", "https://worktime.example/", "worktime.example", emptyList()),
                    oidcConfig = OidcConfig("client", Uri.parse("com.worktime.android:/oauth2redirect"), "openid"),
                    notificationPreferences = NotificationPreferences(),
                    apiBaseUrlOverride = null,
                    onApiBaseUrlOverrideSave = {},
                    onApiBaseUrlOverrideClear = {},
                    onPlannedTaskNotificationsChanged = {},
                    onTimeTrackingNotificationsChanged = {},
                    onSyncNotificationsChanged = {},
                    onOpenNotificationSettings = onOpenNotificationSettings,
                    biometricLockPreferences = BiometricLockPreferences(),
                    onBiometricLockEnabledChanged = {},
                    onBiometricIdleTimeoutChanged = {},
                    onLogout = onLogout
                )
            }
        }
    }

    @Test
    fun keepsNativeSessionAppLockAndNotificationControls() {
        var loggedOut = false
        var notificationSettingsOpened = false
        renderAccount(onLogout = {
            loggedOut = true
        }, onOpenNotificationSettings = { notificationSettingsOpened = true })

        composeTestRule.onNodeWithText("App lock").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("Open notification settings").performScrollTo().performClick()
        composeTestRule.onNodeWithText("Sign out").performScrollTo().performClick()

        assertEquals(true, notificationSettingsOpened)
        assertEquals(true, loggedOut)
    }

    @Test
    fun noLongerOffersNativeManagementWorkflows() {
        renderAccount()

        listOf("Work location defaults", "Labels", "Templates", "Danger zone", "Delete my account").forEach {
            composeTestRule.onNodeWithText(it).assertDoesNotExist()
        }
    }

    @Test
    fun webManagementCard_opensEachEntryPointAndHidesAdministrationFromMembers() {
        val opened = mutableListOf<WebEntryPoint>()
        composeTestRule.setContent {
            MaterialTheme {
                WebManagementCard(showAdministration = false, openFailed = false, onOpen = { opened += it })
            }
        }

        composeTestRule.onNodeWithText("Manage time off").performClick()
        composeTestRule.onNodeWithText("Open settings").performClick()
        composeTestRule.onNodeWithText("Open administration").assertDoesNotExist()

        assertEquals(listOf(WebEntryPoint.TimeOff, WebEntryPoint.Settings), opened)
    }

    @Test
    fun webManagementCard_showsAdministrationToAdminsAndReportsAFailedOpen() {
        val opened = mutableListOf<WebEntryPoint>()
        composeTestRule.setContent {
            MaterialTheme {
                WebManagementCard(showAdministration = true, openFailed = true, onOpen = { opened += it })
            }
        }

        composeTestRule.onNodeWithText("Open administration").performClick()
        composeTestRule.onNodeWithText("No app on this device could open the web page.").assertIsDisplayed()

        assertEquals(listOf(WebEntryPoint.Administration), opened)
    }
}
