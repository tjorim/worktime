package com.worktime.android.app

import android.content.Context
import com.worktime.android.BuildConfig
import com.worktime.android.core.auth.OidcConfig
import com.worktime.android.core.auth.OidcSessionManager
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.network.AndroidConnectivityObserver
import com.worktime.android.core.network.CertificatePinnerProvider
import com.worktime.android.core.network.ConnectivityObserver
import com.worktime.android.core.storage.ApiBaseUrlOverrideStore
import com.worktime.android.core.storage.BiometricLockPreferencesStore
import com.worktime.android.core.storage.DashboardCacheStore
import com.worktime.android.core.storage.NotificationPreferencesStore
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.repository.WorktimeRepository

class WorktimeAppContainer(
    context: Context,
    val appConfig: AppConfig,
    val oidcConfig: OidcConfig,
    val apiBaseUrlOverrideStore: ApiBaseUrlOverrideStore,
    val sessionManager: OidcSessionManager
) {
    val notificationPreferencesStore = NotificationPreferencesStore(context)
    val biometricLockPreferencesStore = BiometricLockPreferencesStore(context)
    val connectivityObserver: ConnectivityObserver = AndroidConnectivityObserver(context)
    private val dashboardCacheStore = DashboardCacheStore(context)
    private val api =
        WorktimeApi.create(
            baseUrl = appConfig.apiBaseUrl,
            enableNetworkLogging = BuildConfig.DEBUG,
            certificatePinner = CertificatePinnerProvider.fromConfig(appConfig),
            baseUrlOverrideProvider = apiBaseUrlOverrideStore::currentOverrideBlocking
        )
    val dashboardRepository =
        WorktimeRepository(api = api, sessionController = sessionManager, cache = dashboardCacheStore)
}
