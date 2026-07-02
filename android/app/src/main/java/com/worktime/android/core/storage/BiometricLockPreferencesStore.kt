package com.worktime.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

data class BiometricLockPreferences(
    val lockEnabled: Boolean = false,
    val idleTimeoutMinutes: Int = DEFAULT_IDLE_TIMEOUT_MINUTES,
    val lastBackgroundEpochMillis: Long? = null
) {
    companion object {
        const val DEFAULT_IDLE_TIMEOUT_MINUTES = 1
    }
}

/**
 * Opt-in app-lock preferences: whether the biometric/device-credential gate is enabled,
 * how long the app may sit idle in the background before re-authentication is required,
 * and the timestamp of the last backgrounding, used to evaluate that idle window on resume.
 */
class BiometricLockPreferencesStore(context: Context) {
    private val dataStore =
        PreferenceDataStoreFactory.create(
            produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) }
        )

    val preferences: Flow<BiometricLockPreferences> =
        dataStore.data
            .catch { error ->
                if (error is IOException) emit(emptyPreferences()) else throw error
            }.map { prefs ->
                BiometricLockPreferences(
                    lockEnabled = prefs[KEY_LOCK_ENABLED] ?: false,
                    idleTimeoutMinutes = prefs[KEY_IDLE_TIMEOUT_MINUTES]
                        ?: BiometricLockPreferences.DEFAULT_IDLE_TIMEOUT_MINUTES,
                    lastBackgroundEpochMillis = prefs[KEY_LAST_BACKGROUND_EPOCH_MILLIS]
                )
            }

    suspend fun setLockEnabled(value: Boolean) {
        dataStore.edit { it[KEY_LOCK_ENABLED] = value }
    }

    suspend fun setIdleTimeoutMinutes(value: Int) {
        dataStore.edit { it[KEY_IDLE_TIMEOUT_MINUTES] = value }
    }

    suspend fun setLastBackgroundEpochMillis(value: Long) {
        dataStore.edit { it[KEY_LAST_BACKGROUND_EPOCH_MILLIS] = value }
    }

    private companion object {
        const val PREFERENCES_FILE = "biometric_lock_preferences.pb"
        val KEY_LOCK_ENABLED = booleanPreferencesKey("lock_enabled")
        val KEY_IDLE_TIMEOUT_MINUTES = intPreferencesKey("idle_timeout_minutes")
        val KEY_LAST_BACKGROUND_EPOCH_MILLIS = longPreferencesKey("last_background_epoch_millis")
    }
}
