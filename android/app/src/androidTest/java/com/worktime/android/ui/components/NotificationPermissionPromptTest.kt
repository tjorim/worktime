package com.worktime.android.ui.components

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.worktime.android.core.notifications.NotificationPermissionState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class NotificationPermissionPromptTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun render(state: NotificationPermissionState, onRequest: () -> Unit = {}, onSettings: () -> Unit = {}) {
        composeTestRule.setContent {
            NotificationPermissionPrompt(state, onRequestPermission = onRequest, onOpenSettings = onSettings)
        }
    }

    @Test
    fun grantedShowsNothing() {
        render(NotificationPermissionState.Granted)
        composeTestRule.onNodeWithText("Reminders are off").assertDoesNotExist()
    }

    @Test
    fun notRequestedExplainsAndAsksForPermission() {
        var requests = 0
        render(NotificationPermissionState.NotRequested, onRequest = { requests++ })
        composeTestRule.onNodeWithText("lock screen reminders only say", substring = true).assertIsDisplayed()
        composeTestRule.onNodeWithText("Allow notifications").performClick()
        assertEquals(1, requests)
    }

    @Test
    fun blockedOffersSystemSettings() {
        var opened = 0
        render(NotificationPermissionState.NeedsSettings, onSettings = { opened++ })
        composeTestRule.onNodeWithText("Open notification settings").performClick()
        assertEquals(1, opened)
    }
}
