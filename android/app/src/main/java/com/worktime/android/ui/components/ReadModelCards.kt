package com.worktime.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.data.model.ShiftSummary
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter

@Composable
fun SummaryCard(
    title: String,
    body: @Composable ColumnScopeShim.() -> Unit,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(text = title, style = MaterialTheme.typography.titleMedium)
            ColumnScopeShim(this).body()
        }
    }
}

class ColumnScopeShim(
    private val scope: androidx.compose.foundation.layout.ColumnScope,
) {
    @Composable
    fun text(label: String, value: String) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(text = label, style = MaterialTheme.typography.bodyMedium)
            Text(text = value, style = MaterialTheme.typography.bodyMedium)
        }
    }

    @Composable
    fun content(block: @Composable androidx.compose.foundation.layout.ColumnScope.() -> Unit) {
        scope.block()
    }
}

fun formatInstant(value: String): String = runCatching {
    OffsetDateTime.parse(value).format(DateTimeFormatter.ofPattern("EEE, MMM d • HH:mm"))
}.getOrDefault(value)

fun formatDate(value: String): String = runCatching {
    value
}.getOrDefault(value)

fun formatShift(shift: ShiftSummary): String {
    val hours = if (shift.startHour != null && shift.endHour != null) {
        " ${shift.startHour.toPrettyHour()}-${shift.endHour.toPrettyHour()}"
    } else {
        ""
    }
    return "${shift.name} (${shift.displayCode})$hours"
}

private fun Double.toPrettyHour(): String {
    val totalMinutes = (this * 60).toInt()
    val hour = (totalMinutes / 60) % 24
    val minute = totalMinutes % 60
    return "%02d:%02d".format(hour, minute)
}
