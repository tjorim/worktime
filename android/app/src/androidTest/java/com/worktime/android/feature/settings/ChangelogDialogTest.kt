package com.worktime.android.feature.settings

import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class ChangelogDialogTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun showsReleaseAndPlansAndCloses() {
        var dismissed = false
        val changelog = Changelog(
            releases = listOf(
                ChangelogRelease(
                    "2026.11.1",
                    "2026-11-10",
                    listOf(
                        ChangelogCategory("Added", listOf(ChangelogEntry("Offline notes")))
                    )
                )
            ),
            unreleased = ChangelogUnreleased(
                listOf(
                    ChangelogCategory("Planned", listOf(ChangelogEntry("Calendar export")))
                )
            )
        )
        composeTestRule.setContent {
            MaterialTheme {
                ChangelogDialogContent(changelog) { dismissed = true }
            }
        }
        composeTestRule.onNodeWithText("2026.11.1 · 2026-11-10").assertIsDisplayed()
        composeTestRule.onNodeWithText("• Offline notes").assertIsDisplayed()
        composeTestRule.onNodeWithText("Coming soon").assertIsDisplayed()
        composeTestRule.onNodeWithText("• Calendar export").assertIsDisplayed()
        composeTestRule.onNodeWithText("Close").performClick()
        assertTrue(dismissed)
    }
}
