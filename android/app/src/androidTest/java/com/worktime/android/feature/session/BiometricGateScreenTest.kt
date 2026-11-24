package com.worktime.android.feature.session

import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.worktime.android.core.auth.BiometricAvailability
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class BiometricGateScreenTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun idleGateOffersUnlock() {
        var unlocks = 0
        composeTestRule.setContent {
            BiometricGateScreen(
                availability = BiometricAvailability.Available,
                isPrompting = false,
                onUnlock = { unlocks++ },
                onContinueWithoutLock = {}
            )
        }

        composeTestRule.onNodeWithText("Worktime is locked").assertIsDisplayed()
        composeTestRule.onNodeWithText("Unlock").assertIsEnabled().performClick()
        assertEquals(1, unlocks)
    }

    @Test
    fun promptInProgressDisablesUnlock() {
        composeTestRule.setContent {
            BiometricGateScreen(
                availability = BiometricAvailability.Available,
                isPrompting = true,
                onUnlock = {},
                onContinueWithoutLock = {}
            )
        }

        composeTestRule.onNodeWithText("Waiting for confirmation…").assertIsNotEnabled()
    }

    @Test
    fun resetPromptStateReEnablesUnlockAfterHostRecreation() {
        val prompting = mutableStateOf(true)
        composeTestRule.setContent {
            BiometricGateScreen(
                availability = BiometricAvailability.Available,
                isPrompting = prompting.value,
                onUnlock = {},
                onContinueWithoutLock = {}
            )
        }
        composeTestRule.onNodeWithText("Waiting for confirmation…").assertIsNotEnabled()

        composeTestRule.runOnIdle { prompting.value = false }

        composeTestRule.onNodeWithText("Unlock").assertIsEnabled()
    }

    @Test
    fun unavailableAuthenticationOffersContinue() {
        var continued = 0
        composeTestRule.setContent {
            BiometricGateScreen(
                availability = BiometricAvailability.Unavailable("No hardware"),
                isPrompting = false,
                onUnlock = {},
                onContinueWithoutLock = { continued++ }
            )
        }

        composeTestRule.onNodeWithText("No hardware").assertIsDisplayed()
        composeTestRule.onNodeWithText("Continue").performClick()
        assertEquals(1, continued)
    }
}
