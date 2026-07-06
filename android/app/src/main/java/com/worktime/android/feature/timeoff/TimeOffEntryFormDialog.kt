package com.worktime.android.feature.timeoff

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.repository.TimeOffDraft
import com.worktime.android.ui.components.DatePickerField
import java.time.LocalDate

private enum class EntryKindOption(val label: String) {
    SINGLE_DATE("Single day"),
    DATE_RANGE("Date range"),
    WEEKLY("Weekly")
}

private const val WEEKDAY_MONDAY = 1
private const val WEEKDAY_TUESDAY = 2
private const val WEEKDAY_WEDNESDAY = 3
private const val WEEKDAY_THURSDAY = 4
private const val WEEKDAY_FRIDAY = 5
private const val WEEKDAY_SATURDAY = 6
private const val WEEKDAY_SUNDAY = 7

private val WEEKDAY_OPTIONS =
    listOf(
        WEEKDAY_MONDAY to "Monday",
        WEEKDAY_TUESDAY to "Tuesday",
        WEEKDAY_WEDNESDAY to "Wednesday",
        WEEKDAY_THURSDAY to "Thursday",
        WEEKDAY_FRIDAY to "Friday",
        WEEKDAY_SATURDAY to "Saturday",
        WEEKDAY_SUNDAY to "Sunday"
    )

private val ENTRY_TYPE_OPTIONS =
    listOf(
        "vacation" to "Vacation",
        "business" to "Business trip",
        "course" to "Course",
        "in" to "In lieu",
        "weekend" to "Weekend",
        "birthday" to "Birthday",
        "ill" to "Sick",
        "other" to "Other"
    )

private val ENTRY_FLAG_OPTIONS =
    listOf(
        "full_day" to "Full day",
        "half_am" to "Half day (morning)",
        "half_pm" to "Half day (afternoon)",
        "onsite" to "Onsite",
        "no_fly" to "No fly",
        "can_fly" to "Can fly"
    )

/** Form fields state, created fresh per [existingEntry] so switching between entries resets it. */
private class TimeOffFormFieldsState(existingEntry: TimeOffEntryRecord?) {
    var entryKind by
        mutableStateOf(
            when (existingEntry?.entryKind) {
                "range" -> EntryKindOption.DATE_RANGE
                "weekly" -> EntryKindOption.WEEKLY
                else -> EntryKindOption.SINGLE_DATE
            }
        )
    var singleDate by mutableStateOf(existingEntry?.date?.let(LocalDate::parse))
    var rangeStart by mutableStateOf(existingEntry?.startDate?.let(LocalDate::parse))
    var rangeEnd by mutableStateOf(existingEntry?.endDate?.let(LocalDate::parse))
    var weekday by mutableStateOf(existingEntry?.weekday ?: WEEKDAY_MONDAY)
    var entryType by mutableStateOf(existingEntry?.entryType ?: ENTRY_TYPE_OPTIONS.first().first)
    var entryFlag by mutableStateOf(existingEntry?.entryFlag ?: ENTRY_FLAG_OPTIONS.first().first)
    var note by mutableStateOf(existingEntry?.note ?: "")

    val rangeIsInvalid: Boolean
        get() {
            val start = rangeStart
            val end = rangeEnd
            return entryKind == EntryKindOption.DATE_RANGE && start != null && end != null && end <= start
        }

    val draft: TimeOffDraft?
        get() = when (entryKind) {
            EntryKindOption.SINGLE_DATE ->
                singleDate?.let { TimeOffDraft.SingleDate(it, entryType, entryFlag, note.ifBlank { null }) }
            EntryKindOption.DATE_RANGE -> {
                val start = rangeStart
                val end = rangeEnd
                if (start != null && end != null && end > start) {
                    TimeOffDraft.DateRange(start, end, entryType, entryFlag, note.ifBlank { null })
                } else {
                    null
                }
            }
            EntryKindOption.WEEKLY -> TimeOffDraft.Weekly(weekday, entryType, entryFlag, note.ifBlank { null })
        }
}

@Composable
fun TimeOffEntryFormDialog(
    existingEntry: TimeOffEntryRecord?,
    isSubmitting: Boolean,
    message: String?,
    onDismiss: () -> Unit,
    onSubmit: (TimeOffDraft) -> Unit
) {
    val formState = remember(existingEntry) { TimeOffFormFieldsState(existingEntry) }
    val draft = formState.draft

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (existingEntry == null) "Add time off" else "Edit time off") },
        text = { TimeOffFormFields(formState = formState, message = message) },
        confirmButton = {
            Button(
                onClick = { draft?.let(onSubmit) },
                enabled = !isSubmitting && draft != null
            ) {
                Text(if (existingEntry == null) "Add" else "Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isSubmitting) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun TimeOffFormFields(formState: TimeOffFormFieldsState, message: String?) {
    Column(
        modifier = Modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        EntryKindSelector(selected = formState.entryKind, onSelect = { formState.entryKind = it })
        TimeOffKindFields(formState)
        LabeledDropdown(
            label = "Type",
            options = ENTRY_TYPE_OPTIONS,
            selected = formState.entryType,
            onSelect = { formState.entryType = it }
        )
        LabeledDropdown(
            label = "Flag",
            options = ENTRY_FLAG_OPTIONS,
            selected = formState.entryFlag,
            onSelect = { formState.entryFlag = it }
        )
        OutlinedTextField(
            value = formState.note,
            onValueChange = { formState.note = it },
            label = { Text("Note (optional)") },
            modifier = Modifier.fillMaxWidth()
        )
        message?.takeIf { it.isNotBlank() }?.let { Text(text = it) }
    }
}

@Composable
private fun TimeOffKindFields(formState: TimeOffFormFieldsState) {
    when (formState.entryKind) {
        EntryKindOption.SINGLE_DATE ->
            DatePickerField(
                label = "Date",
                date = formState.singleDate,
                onDateSelected = { formState.singleDate = it }
            )
        EntryKindOption.DATE_RANGE -> {
            DatePickerField(
                label = "Start date",
                date = formState.rangeStart,
                onDateSelected = { formState.rangeStart = it }
            )
            DatePickerField(label = "End date", date = formState.rangeEnd, onDateSelected = { formState.rangeEnd = it })
            if (formState.rangeIsInvalid) {
                Text("End date must be after start date. Use \"Single day\" for a one-day entry.")
            }
        }
        EntryKindOption.WEEKLY ->
            LabeledDropdown(
                label = "Weekday",
                options = WEEKDAY_OPTIONS,
                selected = formState.weekday,
                onSelect = { formState.weekday = it }
            )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EntryKindSelector(selected: EntryKindOption, onSelect: (EntryKindOption) -> Unit) {
    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
        EntryKindOption.entries.forEachIndexed { index, option ->
            SegmentedButton(
                selected = selected == option,
                onClick = { onSelect(option) },
                shape = SegmentedButtonDefaults.itemShape(index = index, count = EntryKindOption.entries.size)
            ) {
                Text(option.label)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun <T> LabeledDropdown(label: String, options: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    val selectedLabel = options.firstOrNull { it.first == selected }?.second ?: ""
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedLabel,
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier =
            Modifier
                .fillMaxWidth()
                .menuAnchor(MenuAnchorType.PrimaryNotEditable, true)
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { (value, text) ->
                DropdownMenuItem(
                    text = { Text(text) },
                    onClick = {
                        onSelect(value)
                        expanded = false
                    }
                )
            }
        }
    }
}
