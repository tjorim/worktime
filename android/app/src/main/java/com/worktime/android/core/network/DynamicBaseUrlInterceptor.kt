package com.worktime.android.core.network

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.Interceptor
import okhttp3.Response

/**
 * Rewrites each request's scheme/host/port to the override base URL when one is set,
 * so a running build can be pointed at a different backend without rebuilding.
 * Returns the request untouched when the provider yields null or an unparseable URL.
 */
class DynamicBaseUrlInterceptor(private val overrideBaseUrl: () -> String?) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val override = overrideBaseUrl()?.toHttpUrlOrNull() ?: return chain.proceed(request)
        val rewrittenUrl =
            request.url
                .newBuilder()
                .scheme(override.scheme)
                .host(override.host)
                .port(override.port)
                .build()
        return chain.proceed(request.newBuilder().url(rewrittenUrl).build())
    }

    companion object {
        fun isValidOverride(value: String): Boolean = value.toHttpUrlOrNull() != null
    }
}
