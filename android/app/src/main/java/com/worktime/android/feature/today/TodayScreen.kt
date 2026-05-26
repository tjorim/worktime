package com.worktime.android.feature.today

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.feature.dashboard.MobileActionsUiState
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.components.ReadModelScreen
import com.worktime.android.ui.components.ScreenList
import com.worktime.android.ui.components.SummaryCard
import com.worktime.android.ui.components.formatInstant
import com.worktime.android.ui.components.formatShift
import java.time.LocalDate

@Composable
fun TodayScreen(
    uiState: DashboardUiState,
    actionsState: MobileActionsUiState,
    onRetry: () -> Unit,
    onStartTracking: (String, String?) -> Unit,
    onStopTracking: (String) -> Unit,
    onUpdateTask: (String, String?, String?) -> Unit,
    onSetWorkLocation: (LocalDate, String, String?) -> Unit,
) {
    ReadModelScreen(title = "Today", uiState = uiState, onRetry = onRetry) { dashboard ->
        var taskText by remember(actionsState.runningTask) { mutableStateOf(actionsState.runningTask?.text ?: "") }
        var taskLabel by remember(actionsState.runningTask) { mutableStateOf(actionsState.runningTask?.labelId ?: "") }
        var workLocationDate by remember { mutableStateOf(LocalDate.now().toString()) }
        var countryCode by remember { mutableStateOf("") }
        var workLocationLabel by remember { mutableStateOf("") }

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
                        },
                    )
                    text(
                        "Off-day progress",
                        dashboard.currentStatus.offDayProgress?.let { "${it.current}/${it.total}" } ?: "—",
                    )
                }
            }
            item {
                SummaryCard(title = "Time tracking") {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = taskText,
                            onValueChange = { taskText = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Task") },
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = taskLabel,
                            onValueChange = { taskLabel = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Label (optional)") },
                            singleLine = true,
                        )
                        if (actionsState.runningTask == null) {
                            Button(
                                onClick = { onStartTracking(taskText, taskLabel.ifBlank { null }) },
                                enabled = !actionsState.isSubmitting && taskText.isNotBlank(),
                            ) {
                                Text("Start timer")
                            }
                        } else {
                            Button(
                                onClick = {
                                    onUpdateTask(
                                        actionsState.runningTask.id,
                                        taskText,
                                        taskLabel.ifBlank { null },
                                    )
                                },
                                enabled = !actionsState.isSubmitting && taskText.isNotBlank(),
                            ) {
                                Text("Update task")
                            }
                            Button(
                                onClick = { onStopTracking(actionsState.runningTask.id) },
                                enabled = !actionsState.isSubmitting,
                            ) {
                                Text("Stop timer")
                            }
                        }
                        text("Running task", actionsState.runningTask?.text ?: "None")
                    }
                }
            }
            item {
                SummaryCard(title = "Work location") {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        OutlinedTextField(
                            value = workLocationDate,
                            onValueChange = { workLocationDate = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Date (YYYY-MM-DD)") },
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = countryCode,
                            onValueChange = { countryCode = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Country code") },
                            singleLine = true,
                        )
                        OutlinedTextField(
                            value = workLocationLabel,
                            onValueChange = { workLocationLabel = it },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Label (optional)") },
                            singleLine = true,
                        )
                        Button(
                            onClick = {
                                runCatching { LocalDate.parse(workLocationDate) }.getOrNull()?.let { parsedDate ->
                                    onSetWorkLocation(parsedDate, countryCode, workLocationLabel.ifBlank { null })
                                }
                            },
                            enabled = !actionsState.isSubmitting && countryCode.length >= 2,
                        ) {
                            Text("Set work location")
                        }
                        text("Weekly entries", actionsState.weeklyWorkLocations.size.toString())
                    }
                }
            }
            item {
                SummaryCard(title = "Sync") {
                    text("Server timestamp", actionsState.syncStatus?.serverTimestamp ?: "Unavailable")
                    text("Task updates", actionsState.syncStatus?.tasksUpdatedAt ?: "—")
                    text("Location updates", actionsState.syncStatus?.workLocationsUpdatedAt ?: "—")
                    if (!actionsState.message.isNullOrBlank()) {
                        Text(
                            text = actionsState.message,
                            modifier = Modifier.padding(top = 8.dp),
                        )
                    }
                }
            }
        }
    }
}
