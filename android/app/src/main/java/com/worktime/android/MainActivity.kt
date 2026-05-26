package com.worktime.android

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.worktime.android.app.WorktimeApp
import com.worktime.android.app.WorktimeAndroidApplication

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val container = (application as WorktimeAndroidApplication).container
        setContent {
            WorktimeApp(container = container)
        }
    }
}
