package com.worktime.android.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Event
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusProperties
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerField(label: String, date: LocalDate?, onDateSelected: (LocalDate) -> Unit) {
    var showPicker by remember { mutableStateOf(false) }
    OutlinedTextField(
        value = date?.toString().orEmpty(),
        onValueChange = {},
        readOnly = true,
        label = { Text(label) },
        placeholder = { Text("Select $label") },
        trailingIcon = {
            Icon(
                imageVector = Icons.Filled.Event,
                contentDescription = label
            )
        },
        modifier =
        Modifier
            .fillMaxWidth()
            .focusProperties { canFocus = false }
            .clickable { showPicker = true }
    )
    if (showPicker) {
        val state =
            rememberDatePickerState(
                initialSelectedDateMillis = date?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli()
            )
        DatePickerDialog(
            onDismissRequest = { showPicker = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { millis ->
                        onDateSelected(Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate())
                    }
                    showPicker = false
                }) {
                    Text("OK")
                }
            },
            dismissButton = {
                TextButton(onClick = { showPicker = false }) {
                    Text("Cancel")
                }
            }
        ) {
            androidx.compose.material3.DatePicker(state = state)
        }
    }
}
