package com.worktime.android.app

import android.content.Context
import com.worktime.android.BuildConfig
import com.worktime.android.core.auth.OidcConfig
import com.worktime.android.core.auth.OidcSessionManager
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.network.AndroidConnectivityObserver
import com.worktime.android.core.network.CertificatePinnerProvider
import com.worktime.android.core.network.ConnectivityObserver
import com.worktime.android.core.network.DynamicBaseUrlInterceptor
import com.worktime.android.core.storage.ApiBaseUrlOverrideStore
import com.worktime.android.core.storage.BiometricLockPreferencesStore
import com.worktime.android.core.storage.DashboardCacheStore
import com.worktime.android.core.storage.NotificationPreferencesStore
import com.worktime.android.core.sync.SseSyncSignalTransport
import com.worktime.android.core.sync.SyncSignalTransport
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.repository.WorktimeRepository
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.OkHttpClient

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

    // Only alive while at least one SyncSignalTransport.subscribe() is active (foregrounded +
    // authenticated, see DashboardViewModel) -- SupervisorJob keeps a failed connect attempt from
    // poisoning the scope for the next one.
    private val syncScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    // A dedicated client, not the Retrofit one: the SSE connection is held open indefinitely
    // between the server's 15s keepalive comments (see AGENTS.md "Live Updates"), which a normal
    // finite read timeout would tear down as a stall.
    private val sseClient =
        OkHttpClient
            .Builder()
            .certificatePinner(CertificatePinnerProvider.fromConfig(appConfig))
            .addInterceptor(DynamicBaseUrlInterceptor(apiBaseUrlOverrideStore::currentOverrideBlocking))
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
    private val normalizedApiBaseUrl =
        if (appConfig.apiBaseUrl.endsWith("/")) appConfig.apiBaseUrl else "${appConfig.apiBaseUrl}/"
    val syncSignalTransport: SyncSignalTransport =
        SseSyncSignalTransport(
            url = "${normalizedApiBaseUrl}api/sync/events",
            client = sseClient,
            tokenProvider = sessionManager::getFreshAccessToken,
            scope = syncScope
        )
}
