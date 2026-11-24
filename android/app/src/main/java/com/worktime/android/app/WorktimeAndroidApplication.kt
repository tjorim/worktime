package com.worktime.android.app

import android.app.Application
import com.worktime.android.core.auth.OidcConfig
import com.worktime.android.core.auth.OidcSessionManager
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.notifications.ReminderScheduler
import com.worktime.android.core.notifications.WorktimeNotifications
import com.worktime.android.core.notifications.clearRemindersOnSignOut
import com.worktime.android.core.storage.ApiBaseUrlOverrideStore
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

@HiltAndroidApp
class WorktimeAndroidApplication : Application() {
    @Inject
    lateinit var appConfig: AppConfig

    @Inject
    lateinit var oidcConfig: OidcConfig

    @Inject
    lateinit var apiBaseUrlOverrideStore: ApiBaseUrlOverrideStore

    @Inject
    lateinit var sessionManager: OidcSessionManager

    lateinit var container: WorktimeAppContainer
        private set

    // Lives as long as the process, for work that must not depend on an Activity being composed.
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    override fun onCreate() {
        super.onCreate()
        container =
            WorktimeAppContainer(
                context = applicationContext,
                appConfig = appConfig,
                oidcConfig = oidcConfig,
                apiBaseUrlOverrideStore = apiBaseUrlOverrideStore,
                sessionManager = sessionManager
            )
        applicationScope.launch {
            clearRemindersOnSignOut(sessionManager.sessionState) {
                ReminderScheduler(applicationContext).cancelAll()
                WorktimeNotifications(applicationContext).cancelAll()
            }
        }
    }
}
