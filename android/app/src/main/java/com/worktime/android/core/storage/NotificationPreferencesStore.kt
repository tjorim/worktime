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
                    plannedTasksEnabled = prefs[KEY_PLANNED_TASKS_ENABLED] ?: true,
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
        val KEY_TIME_TRACKING_ENABLED = booleanPreferencesKey("time_tracking_enabled")
        val KEY_SYNC_CONFLICTS_ENABLED = booleanPreferencesKey("sync_conflicts_enabled")
    }
}
