package com.worktime.android.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.feature.dashboard.DashboardUiState

@Composable
fun ReadModelScreen(
    title: String,
    uiState: DashboardUiState,
    onRetry: () -> Unit,
    content: @Composable (dashboard: com.worktime.android.data.model.DashboardResponse) -> Unit,
) {
    when (uiState) {
        DashboardUiState.Loading -> LoadingPane(title = title)
        DashboardUiState.LoggedOut -> EmptyPane(
            title = title,
            headline = "Sign in required",
            body = "Authenticate to load your Worktime read models.",
        )
        is DashboardUiState.Error -> EmptyPane(
            title = title,
            headline = "Unable to load $title",
            body = uiState.message,
            actionLabel = "Retry",
            onAction = onRetry,
        )
        is DashboardUiState.Success -> content(uiState.dashboard)
    }
}

@Composable
fun ScreenList(
    title: String,
    body: LazyListScope.() -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(
                text = title,
                style = MaterialTheme.typography.headlineSmall,
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
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = title, style = MaterialTheme.typography.headlineSmall)
        Card(modifier = Modifier.padding(top = 16.dp)) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Text(text = headline, style = MaterialTheme.typography.titleMedium)
                Text(text = body, style = MaterialTheme.typography.bodyMedium)
                if (actionLabel != null && onAction != null) {
                    Button(onClick = onAction) {
                        Text(actionLabel)
                    }
                }
            }
        }
    }
}
