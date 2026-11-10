package com.worktime.android.feature.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.produceState
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

@Composable
internal fun ChangelogDialog(onDismiss: () -> Unit) {
    val context = LocalContext.current
    val changelog by produceState<Changelog?>(initialValue = null, context) {
        value = withContext(Dispatchers.IO) {
            context.assets.open("changelog.json").bufferedReader().use { parseChangelog(it.readText()) }
        }
    }
    ChangelogDialogContent(changelog = changelog, onDismiss = onDismiss)
}

@Composable
internal fun ChangelogDialogContent(changelog: Changelog?, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("What’s new") },
        text = {
            LazyColumn(
                modifier = Modifier.heightIn(max = 480.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (changelog == null) {
                    item { Text("Loading…") }
                } else {
                    if (changelog.releases.isEmpty()) {
                        item { Text("No release notes yet.") }
                    }
                    changelog.releases.forEach { release ->
                        item {
                            Text("${release.version} · ${release.date}", style = MaterialTheme.typography.titleMedium)
                        }
                        release.categories.forEach { category ->
                            item { Text(category.name, style = MaterialTheme.typography.titleSmall) }
                            items(category.entries) { entry -> Text("• ${entry.text}") }
                        }
                    }
                    if (changelog.futurePlans.isNotEmpty()) {
                        item { Text("Coming soon", style = MaterialTheme.typography.titleMedium) }
                        items(changelog.futurePlans) { entry -> Text("• ${entry.text}") }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}
