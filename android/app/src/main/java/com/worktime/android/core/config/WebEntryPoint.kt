package com.worktime.android.core.config

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * Web pages that own the workflows the Android companion deliberately does not duplicate: time-off
 * management, settings and administration. The web app is served from the same origin as the API, so
 * the scheme, host and port of the effective API base URL (build default or runtime override) are also
 * the web origin. Any path on that URL is dropped, as it is for API requests by `DynamicBaseUrlInterceptor`.
 */
enum class WebEntryPoint(val path: String) {
    /** Time-off entries are managed from the web app's home view, which has no deep link of its own. */
    TimeOff("/"),
    Settings("/settings"),
    Administration("/settings?section=admin");

    fun url(baseUrl: String): String = origin(baseUrl) + path

    private companion object {
        fun origin(baseUrl: String): String {
            val parsed = baseUrl.toHttpUrlOrNull() ?: return baseUrl.trimEnd('/')
            val root =
                parsed
                    .newBuilder()
                    .username("")
                    .password("")
                    .encodedPath("/")
                    .query(null)
                    .fragment(null)
                    .build()
            return root.toString().trimEnd('/')
        }
    }
}
