package com.worktime.android.feature.timeoff

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.worktime.android.data.repository.TimeOffDraft
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test

class TimeOffEntryFormDialogTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    private fun renderDialog(onDismiss: () -> Unit = {}, onSubmit: (TimeOffDraft) -> Unit = {}) {
        composeTestRule.setContent {
            TimeOffEntryFormDialog(
                existingEntry = null,
                isSubmitting = false,
                message = null,
                onDismiss = onDismiss,
                onSubmit = onSubmit
            )
        }
    }

    @Test
    fun newEntry_showsAddTimeOffTitle() {
        renderDialog()

        composeTestRule.onNodeWithText("Add time off").assertIsDisplayed()
    }

    @Test
    fun cancelButton_invokesOnDismissWithoutSubmitting() {
        var dismissed = false
        var submitted = false
        renderDialog(onDismiss = { dismissed = true }, onSubmit = { submitted = true })

        composeTestRule.onNodeWithText("Cancel").performClick()

        assertTrue("expected onDismiss to be invoked", dismissed)
        assertTrue("onSubmit must not fire on cancel", !submitted)
    }

    @Test
    fun submittingWeeklyEntry_invokesOnSubmitWithWeeklyDraft() {
        var submittedDraft: TimeOffDraft? = null
        renderDialog(onSubmit = { submittedDraft = it })

        composeTestRule.onNodeWithText("Weekly").performClick()
        composeTestRule.onNodeWithText("Add").performClick()

        val draft = submittedDraft
        assertTrue("expected a Weekly draft, was $draft", draft is TimeOffDraft.Weekly)
        assertEquals(1, (draft as TimeOffDraft.Weekly).weekday)
        assertEquals("vacation", draft.entryType)
        assertEquals("full_day", draft.entryFlag)
    }
}
