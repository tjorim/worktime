package com.worktime.android.core.auth

import android.net.Uri
import java.io.IOException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.openid.appauth.AuthorizationServiceConfiguration
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONException
import org.json.JSONObject

class OidcServiceConfigurationDiscovery(private val client: OkHttpClient = OkHttpClient()) {
    suspend fun fetch(apiBaseUrl: String): AuthorizationServiceConfiguration = withContext(Dispatchers.IO) {
        client.newCall(Request.Builder().url(configUrl(apiBaseUrl)).build()).execute().use { response ->
            if (!response.isSuccessful) {
                // Peek a bounded snippet: an arbitrary server behind a user-set URL can
                // return an error page of any size, which must not be fully buffered.
                val errorBody = runCatching { response.peekBody(1024).string() }.getOrElse { "" }
                throw IOException("OIDC config endpoint returned HTTP ${response.code}: $errorBody")
            }
            val body = response.body.string()
            if (body.isBlank()) {
                throw IOException("Empty response from OIDC config endpoint")
            }
            parse(body)
        }
    }

    private fun configUrl(apiBaseUrl: String): String = "${apiBaseUrl.trimEnd('/')}/api/auth/oidc-config"

    private fun parse(body: String): AuthorizationServiceConfiguration = try {
        val json = JSONObject(body)
        AuthorizationServiceConfiguration(
            Uri.parse(json.getString("authorization_url")),
            Uri.parse(json.getString("token_url"))
        )
    } catch (exception: JSONException) {
        throw IOException("Failed to parse OIDC config response", exception)
    }
}
