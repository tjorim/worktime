package com.worktime.android.feature.settings

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
internal data class Changelog(val releases: List<ChangelogRelease>, val unreleased: ChangelogUnreleased? = null) {
    val futurePlans: List<ChangelogEntry>
        get() = unreleased?.categories.orEmpty().filter { it.name == "Planned" }.flatMap { it.entries }
}

@Serializable
internal data class ChangelogUnreleased(val categories: List<ChangelogCategory>)

@Serializable
internal data class ChangelogRelease(val version: String, val date: String, val categories: List<ChangelogCategory>)

@Serializable
internal data class ChangelogCategory(val name: String, val entries: List<ChangelogEntry>)

@Serializable
internal data class ChangelogEntry(val text: String)

private val changelogJson = Json { ignoreUnknownKeys = true }

internal fun parseChangelog(source: String): Changelog = changelogJson.decodeFromString(source)
