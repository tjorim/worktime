package com.worktime.android.core.config

import org.junit.Assert.assertEquals
import org.junit.Test

class WebEntryPointTest {
    @Test
    fun buildsUrlsOnTheApiOrigin() {
        assertEquals("https://worktime.tjor.im/", WebEntryPoint.TimeOff.url("https://worktime.tjor.im"))
        assertEquals("https://worktime.tjor.im/settings", WebEntryPoint.Settings.url("https://worktime.tjor.im"))
        assertEquals(
            "https://worktime.tjor.im/settings?section=admin",
            WebEntryPoint.Administration.url("https://worktime.tjor.im")
        )
    }

    @Test
    fun ignoresTrailingSlashesOnTheBaseUrl() {
        assertEquals("https://staging.example/settings", WebEntryPoint.Settings.url("https://staging.example/"))
        assertEquals("https://staging.example/", WebEntryPoint.TimeOff.url("https://staging.example//"))
    }

    @Test
    fun dropsAnyPathQueryAndCredentialsFromTheBaseUrl() {
        assertEquals("https://staging.example/settings", WebEntryPoint.Settings.url("https://staging.example/api/"))
        assertEquals(
            "https://staging.example:8443/settings?section=admin",
            WebEntryPoint.Administration.url("https://user:pw@staging.example:8443/api/v1?x=1#frag")
        )
        assertEquals("http://10.0.2.2:8000/", WebEntryPoint.TimeOff.url("http://10.0.2.2:8000/"))
    }
}
