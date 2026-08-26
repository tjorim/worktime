package com.worktime.android.feature.today

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.data.model.WorkLocationRecord
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.feature.dashboard.MobileActionsUiState
import com.worktime.android.ui.components.DatePickerField
import com.worktime.android.ui.components.LocalDateSaver
import com.worktime.android.ui.components.ReadModelScreen
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard
import com.worktime.android.ui.components.formatDate
import com.worktime.android.ui.components.formatInstant
import com.worktime.android.ui.components.formatShift
import java.time.LocalDate
import java.util.Locale

private const val PRESET_COLOR_RED = "#F44336"
private const val PRESET_COLOR_ORANGE = "#FF9800"
private const val PRESET_COLOR_YELLOW = "#FBC02D"
private const val PRESET_COLOR_GREEN = "#4CAF50"
private const val PRESET_COLOR_TEAL = "#009688"
private const val PRESET_COLOR_BLUE = "#2196F3"
private const val PRESET_COLOR_PURPLE = "#9C27B0"
private const val PRESET_COLOR_GREY = "#607D8B"

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

private const val OPAQUE_ALPHA_MASK = 0xFF000000L
private const val DEFAULT_COUNTRY_CODE = "BE"
private const val HOME_LOCATION_LABEL = "Home"
private const val OFFICE_LOCATION_LABEL = "Office"

private fun parseHexColor(hex: String): Color =
    runCatching { Color(hex.removePrefix("#").toLong(radix = 16) or OPAQUE_ALPHA_MASK) }.getOrDefault(Color.Gray)

@Composable
fun TodayScreen(
    uiState: DashboardUiState,
    actionsState: MobileActionsUiState,
    onRetry: () -> Unit,
    onStartTracking: (String, String?) -> Unit,
    onStopTracking: (String) -> Unit,
    onUpdateTask: (String, String?, String?) -> Unit,
    onSetWorkLocation: (LocalDate, String, String?) -> Unit,
    onDeleteWorkLocation: (LocalDate) -> Unit,
    onCreateLabel: (String, String) -> Unit
) {
    ReadModelScreen(title = "Today", uiState = uiState, onRetry = onRetry) { dashboard ->
        var taskText by
            rememberSaveable(actionsState.runningTask) { mutableStateOf(actionsState.runningTask?.text ?: "") }
        var taskLabelId by
            rememberSaveable(actionsState.runningTask) {
                mutableStateOf(actionsState.runningTask?.labelId ?: "")
            }
        var workLocationDate by rememberSaveable(stateSaver = LocalDateSaver) { mutableStateOf(LocalDate.now()) }
        var countryCode by rememberSaveable { mutableStateOf("") }
        var workLocationLabel by rememberSaveable { mutableStateOf("") }
        val defaultCountryCode =
            remember {
                Locale.getDefault().country.takeIf { it.length == 2 } ?: DEFAULT_COUNTRY_CODE
            }
        val homeCountryCode = actionsState.workLocationPreferences.homeCountry ?: defaultCountryCode
        val officeCountryCode = actionsState.workLocationPreferences.officeCountry ?: defaultCountryCode

        ScreenList(title = "Today") {
            item {
                SummaryCard(title = "Session") {
                    text("User", dashboard.identity.displayName)
                    text("Schedule", dashboard.workContext.scheduleType ?: "Not configured")
                    text("Team", dashboard.workContext.effectiveTeamNumber?.toString() ?: "Not configured")
                    text("Updated", formatInstant(dashboard.asOf))
                }
            }
            item {
                SummaryCard(title = "Current shift") {
                    val current = dashboard.currentStatus.currentShift
                    text("Status", current?.shift?.let(::formatShift) ?: "No work context yet")
                    text("Shift code", current?.shiftCode ?: "—")
                    text(
                        "Working now",
                        if (dashboard.currentStatus.currentlyWorkingTeam != null) {
                            "Team ${dashboard.currentStatus.currentlyWorkingTeam.teamNumber}"
                        } else {
                            "Nobody scheduled right now"
                        }
                    )
                    text(
                        "Off-day progress",
                        dashboard.currentStatus.offDayProgress?.let { "${it.current}/${it.total}" } ?: "—"
                    )
                }
            }
            item {
                SummaryCard(title = "Time tracking") {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        if (actionsState.templates.isNotEmpty()) {
                            TemplateChipsRow(
                                templates = actionsState.templates,
                                onApply = { template ->
                                    taskText = template.text
                                    taskLabelId = template.labelId ?: ""
                                }
                            )
                        }
                        OutlinedTextField(
                            value = taskText,
                            onValueChange = { taskText = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Task") },
                            singleLine = true
                        )
                        LabelPickerField(
                            labels = actionsState.labels,
                            selectedLabelId = taskLabelId,
                            onLabelSelected = { taskLabelId = it },
                            onCreateLabel = onCreateLabel
                        )
                        if (actionsState.runningTask == null) {
                            Button(
                                onClick = { onStartTracking(taskText, taskLabelId.ifBlank { null }) },
                                enabled = !actionsState.isSubmitting && taskText.isNotBlank()
                            ) {
                                Text("Start timer")
                            }
                        } else {
                            Button(
                                onClick = {
                                    onUpdateTask(
                                        actionsState.runningTask.id,
                                        taskText,
                                        taskLabelId.ifBlank { null }
                                    )
                                },
                                enabled = !actionsState.isSubmitting && taskText.isNotBlank()
                            ) {
                                Text("Update task")
                            }
                            Button(
                                onClick = { onStopTracking(actionsState.runningTask.id) },
                                enabled = !actionsState.isSubmitting
                            ) {
                                Text("Stop timer")
                            }
                        }
                        text("Running task", actionsState.runningTask?.text ?: "None")
                    }
                }
            }
            item {
                WorkLocationCard(
                    workLocationDate = workLocationDate,
                    onDateSelected = { workLocationDate = it },
                    countryCode = countryCode,
                    onCountryCodeChange = { countryCode = it.take(2).uppercase() },
                    workLocationLabel = workLocationLabel,
                    onWorkLocationLabelChange = { workLocationLabel = it },
                    weeklyWorkLocations = actionsState.weeklyWorkLocations,
                    isSubmitting = actionsState.isSubmitting,
                    homeCountryCode = homeCountryCode,
                    officeCountryCode = officeCountryCode,
                    onSetWorkLocation = { selectedCountryCode, selectedLabel ->
                        onSetWorkLocation(workLocationDate, selectedCountryCode, selectedLabel)
                    },
                    onEditWorkLocation = { location ->
                        workLocationDate = LocalDate.parse(location.date)
                        countryCode = location.countryCode
                        workLocationLabel = location.label.orEmpty()
                    },
                    onDeleteWorkLocation = { location -> onDeleteWorkLocation(LocalDate.parse(location.date)) }
                )
            }
            item {
                SummaryCard(title = "Sync") {
                    text("Server timestamp", actionsState.syncStatus?.serverTimestamp ?: "Unavailable")
                    text("Task updates", actionsState.syncStatus?.tasksUpdatedAt ?: "—")
                    text("Location updates", actionsState.syncStatus?.workLocationsUpdatedAt ?: "—")
                    actionsState.message?.takeIf { it.isNotBlank() }?.let {
                        Text(text = it, modifier = Modifier.padding(top = 8.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun WorkLocationCard(
    workLocationDate: LocalDate,
    onDateSelected: (LocalDate) -> Unit,
    countryCode: String,
    onCountryCodeChange: (String) -> Unit,
    workLocationLabel: String,
    onWorkLocationLabelChange: (String) -> Unit,
    weeklyWorkLocations: List<WorkLocationRecord>,
    isSubmitting: Boolean,
    homeCountryCode: String,
    officeCountryCode: String,
    onSetWorkLocation: (String, String?) -> Unit,
    onEditWorkLocation: (WorkLocationRecord) -> Unit,
    onDeleteWorkLocation: (WorkLocationRecord) -> Unit
) {
    var showOtherFields by rememberSaveable { mutableStateOf(false) }

    SummaryCard(title = "Work location") {
        content {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                DatePickerField(
                    label = "Date",
                    date = workLocationDate,
                    onDateSelected = onDateSelected
                )
                WorkLocationQuickChips(
                    showOtherFields = showOtherFields,
                    isSubmitting = isSubmitting,
                    onHome = {
                        showOtherFields = false
                        onSetWorkLocation(homeCountryCode, HOME_LOCATION_LABEL)
                    },
                    onOffice = {
                        showOtherFields = false
                        onSetWorkLocation(officeCountryCode, OFFICE_LOCATION_LABEL)
                    },
                    onOther = { showOtherFields = !showOtherFields }
                )
                if (showOtherFields) {
                    OtherWorkLocationFields(
                        countryCode = countryCode,
                        onCountryCodeChange = onCountryCodeChange,
                        workLocationLabel = workLocationLabel,
                        onWorkLocationLabelChange = onWorkLocationLabelChange,
                        isSubmitting = isSubmitting,
                        onSave = { onSetWorkLocation(countryCode, workLocationLabel.ifBlank { null }) }
                    )
                }
                if (weeklyWorkLocations.isNotEmpty()) {
                    WorkLocationChipsRow(
                        locations = weeklyWorkLocations,
                        isSubmitting = isSubmitting,
                        onEdit = { location ->
                            showOtherFields = true
                            onEditWorkLocation(location)
                        },
                        onDelete = onDeleteWorkLocation
                    )
                }
            }
        }
    }
}

@Composable
private fun WorkLocationQuickChips(
    showOtherFields: Boolean,
    isSubmitting: Boolean,
    onHome: () -> Unit,
    onOffice: () -> Unit,
    onOther: () -> Unit
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        // Home/Office are momentary actions (set today's work location), not persistent
        // toggles -- AssistChip has no checkable semantics, unlike FilterChip, so TalkBack
        // won't announce them as an unselected checkable item.
        AssistChip(onClick = onHome, enabled = !isSubmitting, label = { Text("Home") })
        AssistChip(onClick = onOffice, enabled = !isSubmitting, label = { Text("Office") })
        FilterChip(selected = showOtherFields, onClick = onOther, enabled = !isSubmitting, label = { Text("Other") })
    }
}

@Composable
private fun OtherWorkLocationFields(
    countryCode: String,
    onCountryCodeChange: (String) -> Unit,
    workLocationLabel: String,
    onWorkLocationLabelChange: (String) -> Unit,
    isSubmitting: Boolean,
    onSave: () -> Unit
) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(
            value = countryCode,
            onValueChange = onCountryCodeChange,
            modifier = Modifier.weight(1f),
            label = { Text("Country") },
            singleLine = true
        )
        OutlinedTextField(
            value = workLocationLabel,
            onValueChange = onWorkLocationLabelChange,
            modifier = Modifier.weight(2f),
            label = { Text("Label") },
            singleLine = true
        )
    }
    Button(
        onClick = onSave,
        enabled = !isSubmitting && countryCode.length == 2
    ) {
        Text("Save other")
    }
}

@Composable
private fun WorkLocationChipsRow(
    locations: List<WorkLocationRecord>,
    isSubmitting: Boolean,
    onEdit: (WorkLocationRecord) -> Unit,
    onDelete: (WorkLocationRecord) -> Unit
) {
    Row(
        modifier =
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        locations.forEach { location ->
            AssistChip(
                onClick = { onEdit(location) },
                label = { Text(location.chipLabel()) },
                trailingIcon = {
                    Text(
                        text = "✕",
                        modifier = Modifier.clickable(enabled = !isSubmitting) { onDelete(location) }
                    )
                }
            )
        }
    }
}

@Composable
private fun TemplateChipsRow(templates: List<TemplateRecord>, onApply: (TemplateRecord) -> Unit) {
    Row(
        modifier =
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        templates.forEach { template ->
            AssistChip(onClick = { onApply(template) }, label = { Text(template.text) })
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun LabelPickerField(
    labels: List<LabelRecord>,
    selectedLabelId: String,
    onLabelSelected: (String) -> Unit,
    onCreateLabel: (String, String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    var showCreateDialog by rememberSaveable { mutableStateOf(false) }
    val selectedLabel = labels.firstOrNull { it.id == selectedLabelId }

    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
        OutlinedTextField(
            value = selectedLabel?.name ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text("Label (optional)") },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
            modifier =
            Modifier
                .fillMaxWidth()
                .menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable, true)
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
            DropdownMenuItem(
                text = { Text("+ New label") },
                onClick = {
                    expanded = false
                    showCreateDialog = true
                }
            )
        }
    }

    if (showCreateDialog) {
        NewLabelDialog(
            onDismiss = { showCreateDialog = false },
            onCreate = { name, color ->
                onCreateLabel(name, color)
                showCreateDialog = false
            }
        )
    }
}

@Composable
private fun NewLabelDialog(onDismiss: () -> Unit, onCreate: (String, String) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    var selectedColor by rememberSaveable { mutableStateOf(PRESET_LABEL_COLORS.first()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("New label") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
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
                                .clickable { selectedColor = color }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(onClick = { onCreate(name, selectedColor) }, enabled = name.isNotBlank()) {
                Text("Create")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

private fun WorkLocationRecord.chipLabel(): String =
    listOfNotNull(formatDate(date), countryCode, label?.takeIf { it.isNotBlank() }).joinToString(" · ")
