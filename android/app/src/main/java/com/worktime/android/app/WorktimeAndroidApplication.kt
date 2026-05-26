package com.worktime.android.app

import android.app.Application

class WorktimeAndroidApplication : Application() {
    lateinit var container: WorktimeAppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = WorktimeAppContainer(applicationContext)
    }
}
