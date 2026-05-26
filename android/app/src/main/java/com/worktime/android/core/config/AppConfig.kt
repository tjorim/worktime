package com.worktime.android.core.config

import com.worktime.android.BuildConfig

data class AppConfig(
    val environment: String,
    val apiBaseUrl: String,
    val oidcAuthority: String,
    val oidcClientId: String,
    val oidcScope: String,
    val oidcRedirectUri: String,
)

fun buildAppConfig(): AppConfig = AppConfig(
    environment = BuildConfig.WORKTIME_ENVIRONMENT,
    apiBaseUrl = BuildConfig.API_BASE_URL,
    oidcAuthority = BuildConfig.OIDC_AUTHORITY,
    oidcClientId = BuildConfig.OIDC_CLIENT_ID,
    oidcScope = BuildConfig.OIDC_SCOPE,
    oidcRedirectUri = BuildConfig.OIDC_REDIRECT_URI,
)
