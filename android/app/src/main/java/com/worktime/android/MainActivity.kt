package com.worktime.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.worktime.android.app.WorktimeApp
import com.worktime.android.app.WorktimeAndroidApplication
import com.worktime.android.app.navigation.WorktimeDestination
import com.worktime.android.core.notifications.WorktimeNotifications

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as WorktimeAndroidApplication).container
        WorktimeNotifications(this).createChannels()
        val destination = intent?.getStringExtra(WorktimeNotifications.EXTRA_DESTINATION)
            ?: WorktimeDestination.Today.route
        setContent {
            WorktimeApp(container = container, initialDestination = destination)
        }
    }
}
