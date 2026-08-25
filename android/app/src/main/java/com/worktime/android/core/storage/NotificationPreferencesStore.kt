package com.worktime.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStoreFile
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

data class NotificationPreferences(
    val plannedTasksEnabled: Boolean = true,
    val timeTrackingEnabled: Boolean = true,
    val syncConflictsEnabled: Boolean = true
)

class NotificationPreferencesStore(context: Context) {
    private val dataStore =
        PreferenceDataStoreFactory.create(
            produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) }
        )

    val preferences: Flow<NotificationPreferences> =
        dataStore.data
            .catch { error ->
                if (error is IOException) emit(emptyPreferences()) else throw error
            }.map { prefs ->
                NotificationPreferences(
                    // Fall back to the pre-migration "shifts_enabled" key so a user who had
                    // explicitly opted out of the old shift reminder doesn't get silently
                    // re-enrolled into the new planned-task one just because its key changed.
                    // Once the user touches this setting, setPlannedTasksEnabled writes the
                    // new key and this fallback stops mattering for them.
                    plannedTasksEnabled = prefs[KEY_PLANNED_TASKS_ENABLED] ?: prefs[KEY_SHIFTS_ENABLED_LEGACY] ?: true,
                    timeTrackingEnabled = prefs[KEY_TIME_TRACKING_ENABLED] ?: true,
                    syncConflictsEnabled = prefs[KEY_SYNC_CONFLICTS_ENABLED] ?: true
                )
            }

    suspend fun setPlannedTasksEnabled(value: Boolean) {
        dataStore.edit { it[KEY_PLANNED_TASKS_ENABLED] = value }
    }

    suspend fun setTimeTrackingEnabled(value: Boolean) {
        dataStore.edit { it[KEY_TIME_TRACKING_ENABLED] = value }
    }

    suspend fun setSyncConflictsEnabled(value: Boolean) {
        dataStore.edit { it[KEY_SYNC_CONFLICTS_ENABLED] = value }
    }

    private companion object {
        const val PREFERENCES_FILE = "notification_preferences.pb"
        val KEY_PLANNED_TASKS_ENABLED = booleanPreferencesKey("planned_tasks_enabled")

        // Pre-migration key this preference replaced -- read-only fallback, never written.
        val KEY_SHIFTS_ENABLED_LEGACY = booleanPreferencesKey("shifts_enabled")
        val KEY_TIME_TRACKING_ENABLED = booleanPreferencesKey("time_tracking_enabled")
        val KEY_SYNC_CONFLICTS_ENABLED = booleanPreferencesKey("sync_conflicts_enabled")
    }
}
