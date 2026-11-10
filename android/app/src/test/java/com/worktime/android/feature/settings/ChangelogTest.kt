package com.worktime.android.feature.settings

import org.junit.Assert.assertEquals
import org.junit.Test

class ChangelogTest {
    @Test
    fun `reads export with scope metadata and extracts only planned entries`() {
        val changelog = parseChangelog(
            """
            {
              "unreleased": {"categories": [
                {"name": "Added", "entries": [{"text": "Not released"}]},
                {"name": "Planned", "entries": [{"scope": null, "text": "Calendar export"}]}
              ]},
              "releases": [{"version": "2026.11.1", "date": "2026-11-10", "categories": [
                {"name": "Added", "entries": [{"scope": "Android", "text": "Offline notes"}]}
              ]}]
            }
            """.trimIndent()
        )
        assertEquals("Offline notes", changelog.releases.single().categories.single().entries.single().text)
        assertEquals(listOf("Calendar export"), changelog.futurePlans.map { it.text })
        assertEquals("2026.11.1", changelog.releases.single().version)
    }

    @Test
    fun `accepts an export without unreleased notes`() {
        assertEquals(emptyList<ChangelogEntry>(), parseChangelog("""{"releases": []}""").futurePlans)
    }
}
