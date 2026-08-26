package com.worktime.android

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.fragment.app.FragmentActivity
import com.worktime.android.app.WorktimeAndroidApplication
import com.worktime.android.app.WorktimeApp
import com.worktime.android.app.navigation.WorktimeDestination
import com.worktime.android.core.notifications.WorktimeNotifications

class MainActivity : FragmentActivity() {
    // Backs a notification-tap destination request. Read/written outside a Composable, but
    // Compose state's snapshot system supports that, and WorktimeApp observes it to navigate
    // without recreating the Activity (see #1229).
    private var pendingDestination by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as WorktimeAndroidApplication).container
        WorktimeNotifications(this).createChannels()
        val destination =
            intent?.getStringExtra(WorktimeNotifications.EXTRA_DESTINATION)
                ?: WorktimeDestination.Today.route
        setContent {
            WorktimeApp(
                container = container,
                initialDestination = destination,
                pendingDestination = pendingDestination,
                onPendingDestinationConsumed = { pendingDestination = null }
            )
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        pendingDestination = intent.getStringExtra(WorktimeNotifications.EXTRA_DESTINATION)
    }
}
