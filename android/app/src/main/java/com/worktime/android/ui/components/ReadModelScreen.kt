package com.worktime.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import com.worktime.android.feature.dashboard.DashboardUiState
import com.worktime.android.ui.theme.WorktimeSpacing

@Composable
fun ReadModelScreen(
    title: String,
    uiState: DashboardUiState,
    onRetry: () -> Unit,
    content: @Composable (dashboard: com.worktime.android.data.model.DashboardResponse) -> Unit
) {
    when (uiState) {
        DashboardUiState.Loading -> LoadingPane(title = title)
        DashboardUiState.LoggedOut ->
            EmptyPane(
                title = title,
                headline = "Sign in required",
                body = "Authenticate to load your Worktime read models."
            )
        is DashboardUiState.Error ->
            EmptyPane(
                title = title,
                headline = "Unable to load $title",
                body = uiState.message,
                actionLabel = "Retry",
                onAction = onRetry
            )
        is DashboardUiState.Success ->
            BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                val bannerMaxHeight = maxHeight / 2
                Column(modifier = Modifier.fillMaxSize()) {
                    if (uiState.staleAsOf != null) {
                        StaleDataBanner(
                            cachedAt = uiState.staleAsOf,
                            refreshError = uiState.refreshError,
                            // Never let the banner crowd out the data it describes.
                            maxHeight = bannerMaxHeight,
                            onRetry = onRetry
                        )
                    }
                    Box(modifier = Modifier.weight(1f)) {
                        content(uiState.dashboard)
                    }
                }
            }
    }
}

@Composable
private fun StaleDataBanner(cachedAt: String, refreshError: String?, maxHeight: Dp, onRetry: () -> Unit) {
    Card(
        modifier =
        Modifier
            .fillMaxWidth()
            .padding(horizontal = WorktimeSpacing.standard, vertical = WorktimeSpacing.inline),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
    ) {
        // Stacked rather than side by side so a long message and the button reflow at large font scales,
        // and scrollable within [maxHeight] so Retry stays reachable when the message is long.
        Column(
            modifier =
            Modifier
                .fillMaxWidth()
                .heightIn(max = maxHeight)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = WorktimeSpacing.standard, vertical = WorktimeSpacing.inline),
            verticalArrangement = Arrangement.spacedBy(WorktimeSpacing.tight)
        ) {
            Text(
                text =
                if (refreshError != null) {
                    "$refreshError Showing data from ${formatInstant(cachedAt)}."
                } else {
                    "Showing saved data from ${formatInstant(cachedAt)}. Refreshing…"
                },
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onErrorContainer
            )
            TextButton(onClick = onRetry, modifier = Modifier.align(Alignment.End)) {
                Text("Retry")
            }
        }
    }
}

@Composable
fun ScreenList(title: String, body: LazyListScope.() -> Unit) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(WorktimeSpacing.standard),
        verticalArrangement = Arrangement.spacedBy(WorktimeSpacing.compactCard)
    ) {
        item {
            Text(
                text = title,
                modifier = Modifier.semantics { heading() },
                style = MaterialTheme.typography.headlineSmall
            )
        }
        body()
    }
}

@Composable
private fun LoadingPane(title: String) {
    EmptyPane(title = title, headline = "Loading", body = "Fetching the latest Worktime data…")
}

@Composable
fun EmptyPane(
    title: String,
    headline: String,
    body: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null
) {
    CenteredScrollPane(contentPadding = WorktimeSpacing.section) {
        Text(
            text = title,
            modifier = Modifier.semantics { heading() },
            style = MaterialTheme.typography.headlineSmall
        )
        Card(modifier = Modifier.padding(top = WorktimeSpacing.standard)) {
            Column(
                modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(WorktimeSpacing.standard),
                verticalArrangement = Arrangement.spacedBy(WorktimeSpacing.compactCard)
            ) {
                // One announcement for the state, so a loading pane that turns into an error is read out.
                Column(
                    modifier = Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
                    verticalArrangement = Arrangement.spacedBy(WorktimeSpacing.compactCard)
                ) {
                    Text(text = headline, style = MaterialTheme.typography.titleMedium)
                    Text(text = body, style = MaterialTheme.typography.bodyMedium)
                }
                if (actionLabel != null && onAction != null) {
                    Button(onClick = onAction) {
                        Text(actionLabel)
                    }
                }
            }
        }
    }
}
