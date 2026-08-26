package com.worktime.android.feature.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.ui.components.SummaryCard
import java.time.LocalTime

private const val PRESET_COLOR_RED = "#F44336"
private const val PRESET_COLOR_ORANGE = "#FF9800"
private const val PRESET_COLOR_YELLOW = "#FBC02D"
private const val PRESET_COLOR_GREEN = "#4CAF50"
private const val PRESET_COLOR_TEAL = "#009688"
private const val PRESET_COLOR_BLUE = "#2196F3"
private const val PRESET_COLOR_PURPLE = "#9C27B0"
private const val PRESET_COLOR_GREY = "#607D8B"
private const val OPAQUE_ALPHA_MASK = 0xFF000000L

private val PRESET_LABEL_COLORS =
    listOf(
        PRESET_COLOR_RED,
        PRESET_COLOR_ORANGE,
        PRESET_COLOR_YELLOW,
        PRESET_COLOR_GREEN,
        PRESET_COLOR_TEAL,
        PRESET_COLOR_BLUE,
        PRESET_COLOR_PURPLE,
        PRESET_COLOR_GREY
    )

@Composable
fun LabelManagementCard(
    labels: List<LabelRecord>,
    isSubmitting: Boolean,
    onCreateLabel: (String, String) -> Unit,
    onUpdateLabel: (String, String, String) -> Unit,
    onDeleteLabel: (String) -> Unit
) {
    var dialogTargetId by rememberSaveable { mutableStateOf<String?>(null) }
    var showCreateDialog by rememberSaveable { mutableStateOf(false) }
    val dialogTarget = labels.firstOrNull { it.id == dialogTargetId }

    SummaryCard(title = "Labels") {
        content {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (labels.isEmpty()) {
                    Text("No labels yet", style = MaterialTheme.typography.bodySmall)
                } else {
                    labels.forEach { label ->
                        LabelRow(
                            label = label,
                            isSubmitting = isSubmitting,
                            onEdit = { dialogTargetId = label.id },
                            onDelete = { onDeleteLabel(label.id) }
                        )
                    }
                }
                Button(onClick = { showCreateDialog = true }, enabled = !isSubmitting) {
                    Text("Add label")
                }
            }
        }
    }

    if (showCreateDialog) {
        LabelDialog(
            label = null,
            onDismiss = { showCreateDialog = false },
            onSave = { name, color ->
                onCreateLabel(name, color)
                showCreateDialog = false
            }
        )
    }
    dialogTarget?.let { label ->
        LabelDialog(
            label = label,
            onDismiss = { dialogTargetId = null },
            onSave = { name, color ->
                onUpdateLabel(label.id, name, color)
                dialogTargetId = null
            }
        )
    }
}

@Composable
fun TemplateManagementCard(
    labels: List<LabelRecord>,
    templates: List<TemplateRecord>,
    isSubmitting: Boolean,
    onCreateTemplate: (String, String?, LocalTime, LocalTime) -> Unit,
    onUpdateTemplate: (String, String, String?, LocalTime, LocalTime) -> Unit,
    onDeleteTemplate: (String) -> Unit
) {
    var dialogTargetId by rememberSaveable { mutableStateOf<String?>(null) }
    var showCreateDialog by rememberSaveable { mutableStateOf(false) }
    val dialogTarget = templates.firstOrNull { it.id == dialogTargetId }

    SummaryCard(title = "Templates") {
        content {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (templates.isEmpty()) {
                    Text("No templates yet", style = MaterialTheme.typography.bodySmall)
                } else {
                    templates.forEach { template ->
                        TemplateRow(
                            template = template,
                            labelName = labels.firstOrNull { it.id == template.labelId }?.name,
                            isSubmitting = isSubmitting,
                            onEdit = { dialogTargetId = template.id },
                            onDelete = { onDeleteTemplate(template.id) }
                        )
                    }
                }
                Button(onClick = { showCreateDialog = true }, enabled = !isSubmitting) {
                    Text("Add template")
                }
            }
        }
    }

    if (showCreateDialog) {
        TemplateDialog(
            labels = labels,
            template = null,
            onDismiss = { showCreateDialog = false },
            onSave = { text, labelId, startTime, stopTime ->
                onCreateTemplate(text, labelId, startTime, stopTime)
                showCreateDialog = false
            }
        )
    }
    dialogTarget?.let { template ->
        TemplateDialog(
            labels = labels,
            template = template,
            onDismiss = { dialogTargetId = null },
            onSave = { text, labelId, startTime, stopTime ->
                onUpdateTemplate(template.id, text, labelId, startTime, stopTime)
                dialogTargetId = null
            }
        )
    }
}

@Composable
private fun LabelRow(label: LabelRecord, isSubmitting: Boolean, onEdit: () -> Unit, onDelete: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(
            modifier =
            Modifier
                .padding(top = 10.dp)
                .size(16.dp)
                .background(color = parseHexColor(label.color), shape = CircleShape)
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(label.name)
            Text(label.color, style = MaterialTheme.typography.bodySmall)
        }
        TextButton(onClick = onEdit, enabled = !isSubmitting) {
            Text("Edit")
        }
        TextButton(onClick = onDelete, enabled = !isSubmitting) {
            Text("Delete")
        }
    }
}

@Composable
private fun TemplateRow(
    template: TemplateRecord,
    labelName: String?,
    isSubmitting: Boolean,
    onEdit: () -> Unit,
    onDelete: () -> Unit
) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(modifier = Modifier.weight(1f)) {
            Text(template.text)
            Text(
                listOfNotNull("${template.startTime}-${template.stopTime}", labelName).joinToString(" - "),
                style = MaterialTheme.typography.bodySmall
            )
        }
        TextButton(onClick = onEdit, enabled = !isSubmitting) {
            Text("Edit")
        }
        TextButton(onClick = onDelete, enabled = !isSubmitting) {
            Text("Delete")
        }
    }
}

@Composable
private fun LabelDialog(label: LabelRecord?, onDismiss: () -> Unit, onSave: (String, String) -> Unit) {
    var name by rememberSaveable(label) { mutableStateOf(label?.name ?: "") }
    var selectedColor by rememberSaveable(label) { mutableStateOf(label?.color ?: PRESET_LABEL_COLORS.first()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (label == null) "Add label" else "Edit label") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                ColorPicker(selectedColor = selectedColor, onSelect = { selectedColor = it })
            }
        },
        confirmButton = {
            Button(onClick = { onSave(name.trim(), selectedColor) }, enabled = name.isNotBlank()) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun TemplateDialog(
    labels: List<LabelRecord>,
    template: TemplateRecord?,
    onDismiss: () -> Unit,
    onSave: (String, String?, LocalTime, LocalTime) -> Unit
) {
    var text by rememberSaveable(template) { mutableStateOf(template?.text ?: "") }
    var labelId by rememberSaveable(template) { mutableStateOf(template?.labelId ?: "") }
    var startTimeText by rememberSaveable(template) { mutableStateOf(template?.startTime?.take(5) ?: "09:00") }
    var stopTimeText by rememberSaveable(template) { mutableStateOf(template?.stopTime?.take(5) ?: "17:00") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (template == null) "Add template" else "Edit template") },
        text = {
            TemplateDialogFields(
                text = text,
                onTextChange = { text = it },
                labels = labels,
                labelId = labelId,
                onLabelSelected = { labelId = it },
                startTimeText = startTimeText,
                onStartTimeChange = { startTimeText = it },
                stopTimeText = stopTimeText,
                onStopTimeChange = { stopTimeText = it },
                error = error
            )
        },
        confirmButton = {
            Button(
                onClick = {
                    val startTime = parseLocalTime(startTimeText)
                    val stopTime = parseLocalTime(stopTimeText)
                    if (startTime == null || stopTime == null) {
                        error = "Use HH:mm time values"
                    } else {
                        onSave(text.trim(), labelId.ifBlank { null }, startTime, stopTime)
                    }
                },
                enabled = text.isNotBlank()
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
private fun TemplateDialogFields(
    text: String,
    onTextChange: (String) -> Unit,
    labels: List<LabelRecord>,
    labelId: String,
    onLabelSelected: (String) -> Unit,
    startTimeText: String,
    onStartTimeChange: (String) -> Unit,
    stopTimeText: String,
    onStopTimeChange: (String) -> Unit,
    error: String?
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = text,
            onValueChange = onTextChange,
            label = { Text("Task") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        LabelDropdown(labels = labels, selectedLabelId = labelId, onLabelSelected = onLabelSelected)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
                value = startTimeText,
                onValueChange = onStartTimeChange,
                label = { Text("Start") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
                value = stopTimeText,
                onValueChange = onStopTimeChange,
                label = { Text("Stop") },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
        }
        error?.let {
            Text(text = it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun ColorPicker(selectedColor: String, onSelect: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PRESET_LABEL_COLORS.forEach { color ->
            Box(
                modifier =
                Modifier
                    .size(32.dp)
                    .background(color = parseHexColor(color), shape = CircleShape)
                    .border(
                        width = if (color == selectedColor) 2.dp else 0.dp,
                        color = Color.Black,
                        shape = CircleShape
                    ).clip(CircleShape)
                    .clickable { onSelect(color) }
            )
        }
    }
}

@Composable
@OptIn(ExperimentalMaterial3Api::class)
private fun LabelDropdown(labels: List<LabelRecord>, selectedLabelId: String, onLabelSelected: (String) -> Unit) {
    var expanded by rememberSaveable { mutableStateOf(false) }
    val selectedLabel = labels.firstOrNull { it.id == selectedLabelId }

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedLabel?.name ?: "None",
            onValueChange = {},
            readOnly = true,
            label = { Text("Label") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier =
            Modifier
                .fillMaxWidth()
                .menuAnchor(androidx.compose.material3.ExposedDropdownMenuAnchorType.PrimaryNotEditable, true)
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text("None") },
                onClick = {
                    onLabelSelected("")
                    expanded = false
                }
            )
            labels.forEach { label ->
                DropdownMenuItem(
                    text = { Text(label.name) },
                    onClick = {
                        onLabelSelected(label.id)
                        expanded = false
                    }
                )
            }
        }
    }
}

private fun parseHexColor(hex: String): Color =
    runCatching { Color(hex.removePrefix("#").toLong(radix = 16) or OPAQUE_ALPHA_MASK) }.getOrDefault(Color.Gray)

private fun parseLocalTime(value: String): LocalTime? = runCatching { LocalTime.parse(value.trim()) }.getOrNull()
