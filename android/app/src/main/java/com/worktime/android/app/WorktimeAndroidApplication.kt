package com.worktime.android.app

import android.app.Application
import com.worktime.android.core.auth.OidcConfig
import com.worktime.android.core.auth.OidcSessionManager
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.storage.ApiBaseUrlOverrideStore
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

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
    }
}
