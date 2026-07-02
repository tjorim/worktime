package com.worktime.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.network.DynamicBaseUrlInterceptor
import com.worktime.android.ui.components.SummaryCard

@Composable
fun ApiBaseUrlOverrideCard(appConfig: AppConfig, apiBaseUrlOverride: String?, onSave: (String) -> Unit, onClear: () -> Unit) {
    SummaryCard(title = "API environment override") {
        content {
            var draft by rememberSaveable(apiBaseUrlOverride) { mutableStateOf(apiBaseUrlOverride.orEmpty()) }
            val trimmedDraft = draft.trim()
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                label = { Text("API base URL") },
                placeholder = { Text(appConfig.apiBaseUrl) },
                singleLine = true,
                isError = trimmedDraft.isNotEmpty() && !DynamicBaseUrlInterceptor.isValidOverride(trimmedDraft),
                modifier = Modifier.fillMaxWidth()
            )
            Text(
                text = "Point this build at a different backend without reinstalling. Reset to return to the flavor default (${appConfig.apiBaseUrl}).",
                style = MaterialTheme.typography.bodySmall
            )
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = { onSave(trimmedDraft) },
                    enabled =
                    trimmedDraft.isNotEmpty() &&
                        trimmedDraft != apiBaseUrlOverride &&
                        DynamicBaseUrlInterceptor.isValidOverride(trimmedDraft)
                ) {
                    Text("Apply")
                }
                OutlinedButton(onClick = onClear, enabled = apiBaseUrlOverride != null) {
                    Text("Reset")
                }
            }
        }
    }
}
