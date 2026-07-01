package com.worktime.android

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.fragment.app.FragmentActivity
import com.worktime.android.app.WorktimeAndroidApplication
import com.worktime.android.app.WorktimeApp
import com.worktime.android.app.navigation.WorktimeDestination
import com.worktime.android.core.notifications.WorktimeNotifications

class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as WorktimeAndroidApplication).container
        WorktimeNotifications(this).createChannels()
        val destination =
            intent?.getStringExtra(WorktimeNotifications.EXTRA_DESTINATION)
                ?: WorktimeDestination.Today.route
        setContent {
            WorktimeApp(container = container, initialDestination = destination)
        }
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        recreate()
    }
}
