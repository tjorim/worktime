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
}
