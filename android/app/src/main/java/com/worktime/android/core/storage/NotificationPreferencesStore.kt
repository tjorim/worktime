package com.worktime.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStoreFile
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import java.io.IOException

data class NotificationPreferences(
    val shiftsEnabled: Boolean = true,
    val timeTrackingEnabled: Boolean = true,
    val syncConflictsEnabled: Boolean = true,
)

class NotificationPreferencesStore(context: Context) {
    private val dataStore = PreferenceDataStoreFactory.create(
        produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) },
    )

    val preferences: Flow<NotificationPreferences> = dataStore.data
        .catch { error ->
            if (error is IOException) emit(emptyPreferences()) else throw error
        }
        .map { prefs ->
            NotificationPreferences(
                shiftsEnabled = prefs[KEY_SHIFTS_ENABLED] ?: true,
                timeTrackingEnabled = prefs[KEY_TIME_TRACKING_ENABLED] ?: true,
                syncConflictsEnabled = prefs[KEY_SYNC_CONFLICTS_ENABLED] ?: true,
            )
        }

    suspend fun setShiftsEnabled(value: Boolean) {
        dataStore.edit { it[KEY_SHIFTS_ENABLED] = value }
    }

    suspend fun setTimeTrackingEnabled(value: Boolean) {
        dataStore.edit { it[KEY_TIME_TRACKING_ENABLED] = value }
    }

    suspend fun setSyncConflictsEnabled(value: Boolean) {
        dataStore.edit { it[KEY_SYNC_CONFLICTS_ENABLED] = value }
    }

    private companion object {
        const val PREFERENCES_FILE = "notification_preferences.pb"
        val KEY_SHIFTS_ENABLED = booleanPreferencesKey("shifts_enabled")
        val KEY_TIME_TRACKING_ENABLED = booleanPreferencesKey("time_tracking_enabled")
        val KEY_SYNC_CONFLICTS_ENABLED = booleanPreferencesKey("sync_conflicts_enabled")
    }
}
