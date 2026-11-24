package com.worktime.android.core.config

/**
 * Web pages that own the workflows the Android companion deliberately does not duplicate: time-off
 * management, settings and administration. The web app is served from the same origin as the API, so
 * the effective API base URL (build default or runtime override) is also the web origin.
 */
enum class WebEntryPoint(val path: String) {
    /** Time-off entries are managed from the web app's home view, which has no deep link of its own. */
    TimeOff("/"),
    Settings("/settings"),
    Administration("/settings?section=admin");

    fun url(baseUrl: String): String = baseUrl.trimEnd('/') + path
}
