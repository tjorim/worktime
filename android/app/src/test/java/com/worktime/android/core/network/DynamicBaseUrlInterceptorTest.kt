package com.worktime.android.core.network

import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import okhttp3.Request
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DynamicBaseUrlInterceptorTest {
    private lateinit var defaultServer: MockWebServer
    private lateinit var overrideServer: MockWebServer

    @Before
    fun setUp() {
        defaultServer = MockWebServer()
        defaultServer.start()
        overrideServer = MockWebServer()
        overrideServer.start()
    }

    @After
    fun tearDown() {
        defaultServer.close()
        overrideServer.close()
    }

    private fun client(overrideBaseUrl: () -> String?): OkHttpClient = OkHttpClient
        .Builder()
        .addInterceptor(DynamicBaseUrlInterceptor(overrideBaseUrl))
        .build()

    private fun requestAgainstDefaultServer(): Request = Request
        .Builder()
        .url(defaultServer.url("/api/sync/status?user_id=7"))
        .build()

    @Test
    fun requestGoesToConfiguredBaseUrlWithoutOverride() {
        defaultServer.enqueue(MockResponse.Builder().body("{}").build())

        client { null }.newCall(requestAgainstDefaultServer()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }

        assertEquals(1, defaultServer.requestCount)
        assertEquals(0, overrideServer.requestCount)
        assertEquals("/api/sync/status?user_id=7", defaultServer.takeRequest().url.encodedPathAndQueryOrPath())
    }

    @Test
    fun requestIsRewrittenToOverrideSchemeHostAndPort() {
        overrideServer.enqueue(MockResponse.Builder().body("{}").build())

        client { overrideServer.url("/").toString() }.newCall(requestAgainstDefaultServer()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }

        assertEquals(0, defaultServer.requestCount)
        assertEquals(1, overrideServer.requestCount)
        val received = overrideServer.takeRequest()
        assertEquals(overrideServer.url("/").host, received.url.host)
        assertEquals(overrideServer.url("/").port, received.url.port)
        assertEquals("/api/sync/status?user_id=7", received.url.encodedPathAndQueryOrPath())
    }

    @Test
    fun invalidOverrideFallsBackToConfiguredBaseUrl() {
        defaultServer.enqueue(MockResponse.Builder().body("{}").build())

        client { "not a url" }.newCall(requestAgainstDefaultServer()).execute().use { response ->
            assertTrue(response.isSuccessful)
        }

        assertEquals(1, defaultServer.requestCount)
        assertEquals(0, overrideServer.requestCount)
    }

    @Test
    fun clearedOverrideReturnsToConfiguredBaseUrl() {
        var override: String? = overrideServer.url("/").toString()
        val client = client { override }

        overrideServer.enqueue(MockResponse.Builder().body("{}").build())
        client.newCall(requestAgainstDefaultServer()).execute().close()
        assertEquals(1, overrideServer.requestCount)

        override = null
        defaultServer.enqueue(MockResponse.Builder().body("{}").build())
        client.newCall(requestAgainstDefaultServer()).execute().close()
        assertEquals(1, defaultServer.requestCount)
        assertEquals(1, overrideServer.requestCount)
    }

    @Test
    fun isValidOverrideAcceptsHttpUrlsAndRejectsGarbage() {
        assertTrue(DynamicBaseUrlInterceptor.isValidOverride("http://10.0.2.2:8000/"))
        assertTrue(DynamicBaseUrlInterceptor.isValidOverride("https://staging.worktime.example"))
        assertFalse(DynamicBaseUrlInterceptor.isValidOverride("not a url"))
        assertFalse(DynamicBaseUrlInterceptor.isValidOverride("ftp://host/"))
    }

    private fun okhttp3.HttpUrl.encodedPathAndQueryOrPath(): String = encodedQuery?.let { "$encodedPath?$it" } ?: encodedPath
}
