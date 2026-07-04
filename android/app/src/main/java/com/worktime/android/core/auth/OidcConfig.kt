package com.worktime.android.core.auth

import android.net.Uri
import com.worktime.android.BuildConfig

data class OidcConfig(val clientId: String, val redirectUri: Uri, val scope: String)

fun buildOidcConfig(): OidcConfig = OidcConfig(
    clientId = BuildConfig.OIDC_CLIENT_ID,
    redirectUri = Uri.parse("${BuildConfig.APPLICATION_ID}:/oauth2redirect"),
    scope = BuildConfig.OIDC_SCOPE
)
