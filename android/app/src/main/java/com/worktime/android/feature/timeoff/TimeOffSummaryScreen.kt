package com.worktime.android.feature.timeoff

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.repository.TimeOffDraft
import com.worktime.android.ui.components.EmptyPane
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard
import com.worktime.android.ui.components.formatDate

@Composable
fun TimeOffSummaryScreen(
    uiState: TimeOffUiState,
    formState: TimeOffFormState,
    onRetry: () -> Unit,
    onAdd: () -> Unit,
    onEdit: (String) -> Unit,
    onDismissForm: () -> Unit,
    onSubmit: (TimeOffDraft) -> Unit,
    onDelete: (String) -> Unit
) {
    var pendingDeleteId by remember { mutableStateOf<String?>(null) }

    when (uiState) {
        TimeOffUiState.Loading ->
            EmptyPane(
                title = "Time off",
                headline = "Loading",
                body = "Fetching your time-off entries…"
            )
        TimeOffUiState.LoggedOut ->
            EmptyPane(
                title = "Time off",
                headline = "Sign in required",
                body = "Authenticate to manage your time off."
            )
        is TimeOffUiState.Error ->
            EmptyPane(
                title = "Time off",
                headline = "Unable to load time off",
                body = uiState.message,
                actionLabel = "Retry",
                onAction = onRetry
            )
        is TimeOffUiState.Success ->
            ScreenList(title = "Time off") {
                item {
                    Button(onClick = onAdd) {
                        Text("Add time off")
                    }
                }
                if (uiState.entries.isEmpty()) {
                    item {
                        SummaryCard(title = "No entries yet") {
                            text("Entries", "0")
                        }
                    }
                }
                uiState.entries.forEach { entry ->
                    item {
                        TimeOffEntryCard(
                            entry = entry,
                            onEdit = { onEdit(entry.entryId) },
                            onDelete = { pendingDeleteId = entry.entryId }
                        )
                    }
                }
            }
    }

    if (formState.target != null) {
        val existingEntry =
            (uiState as? TimeOffUiState.Success)?.entries?.firstOrNull { entry ->
                (formState.target as? TimeOffFormTarget.Edit)?.entryId == entry.entryId
            }
        TimeOffEntryFormDialog(
            existingEntry = existingEntry,
            isSubmitting = formState.isSubmitting,
            message = formState.message,
            onDismiss = onDismissForm,
            onSubmit = onSubmit
        )
    }

    pendingDeleteId?.let { entryId ->
        AlertDialog(
            onDismissRequest = { pendingDeleteId = null },
            title = { Text("Delete time off entry?") },
            text = { Text("This cannot be undone.") },
            confirmButton = {
                Button(onClick = {
                    onDelete(entryId)
                    pendingDeleteId = null
                }) {
                    Text("Delete")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteId = null }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
private fun TimeOffEntryCard(entry: TimeOffEntryRecord, onEdit: () -> Unit, onDelete: () -> Unit) {
    SummaryCard(title = entry.entryType.replaceFirstChar { it.uppercase() }) {
        text("Dates", entry.datesLabel())
        text("Flag", entry.entryFlag.replace('_', ' '))
        entry.note?.takeIf { it.isNotBlank() }?.let { text("Note", it) }
        content {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                TextButton(onClick = onEdit) {
                    Text("Edit")
                }
                TextButton(onClick = onDelete) {
                    Text("Delete")
                }
            }
        }
    }
}

private fun TimeOffEntryRecord.datesLabel(): String = when (entryKind) {
    "range" -> "${startDate?.let(::formatDate)} → ${endDate?.let(::formatDate)}"
    "weekly" -> "Every ${weekday?.let { WEEKDAY_NAMES[it] } ?: "week"}"
    else -> date?.let(::formatDate) ?: "—"
}

private val WEEKDAY_NAMES =
    mapOf(
        1 to "Monday",
        2 to "Tuesday",
        3 to "Wednesday",
        4 to "Thursday",
        5 to "Friday",
        6 to "Saturday",
        7 to "Sunday"
    )
