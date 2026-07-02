package com.worktime.android.feature.session

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.worktime.android.core.auth.BiometricAvailability

@Composable
fun BiometricGateScreen(availability: BiometricAvailability, isPrompting: Boolean, onUnlock: () -> Unit, onContinueWithoutLock: () -> Unit) {
    Column(
        modifier =
        Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(text = "Worktime is locked", style = MaterialTheme.typography.headlineMedium)
        Card(modifier = Modifier.padding(top = 16.dp)) {
            Column(
                modifier =
                Modifier
                    .fillMaxWidth()
                    .padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Confirm it's you to continue where you left off.",
                    style = MaterialTheme.typography.bodyLarge
                )
                when (availability) {
                    is BiometricAvailability.Unavailable -> {
                        Text(text = availability.message, color = MaterialTheme.colorScheme.error)
                        Button(onClick = onContinueWithoutLock) {
                            Text("Continue")
                        }
                    }
                    BiometricAvailability.Available ->
                        Button(onClick = onUnlock, enabled = !isPrompting) {
                            Text(if (isPrompting) "Waiting for confirmation…" else "Unlock")
                        }
                }
            }
        }
    }
}
