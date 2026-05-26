package com.worktime.android.app

import android.content.Context
import com.worktime.android.BuildConfig
import com.worktime.android.core.auth.OidcSessionManager
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.config.buildAppConfig
import com.worktime.android.core.storage.NotificationPreferencesStore
import com.worktime.android.core.storage.SecureSessionStore
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.repository.WorktimeRepository

class WorktimeAppContainer(context: Context) {
    val appConfig: AppConfig = buildAppConfig()
    private val secureSessionStore = SecureSessionStore(context)
    val notificationPreferencesStore = NotificationPreferencesStore(context)
    val sessionManager = OidcSessionManager(
        context = context,
        appConfig = appConfig,
        sessionStore = secureSessionStore,
    )
    private val api = WorktimeApi.create(
        baseUrl = appConfig.apiBaseUrl,
        enableNetworkLogging = BuildConfig.DEBUG,
    )
    val dashboardRepository = WorktimeRepository(api = api, sessionController = sessionManager)
}
