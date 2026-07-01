package com.worktime.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import java.io.IOException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.runBlocking

/**
 * Persists an optional runtime override for the API base URL, letting an installed build
 * target a different backend without reinstalling another Gradle flavor.
 * When no override is set, callers fall back to the flavor-configured `AppConfig.apiBaseUrl`.
 */
class ApiBaseUrlOverrideStore(context: Context) {
    private val dataStore =
        PreferenceDataStoreFactory.create(
            produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) }
        )

    val override: Flow<String?> =
        dataStore.data
            .catch { error ->
                if (error is IOException) emit(emptyPreferences()) else throw error
            }.map { prefs ->
                prefs[KEY_API_BASE_URL_OVERRIDE]?.takeIf { it.isNotBlank() }
            }

    /**
     * Synchronous read for request-time consumers (OkHttp interceptors run on background
     * threads). DataStore keeps its state in memory after the first read, so this is cheap.
     */
    fun currentOverrideBlocking(): String? = runBlocking { override.first() }

    suspend fun setOverride(url: String) {
        dataStore.edit { it[KEY_API_BASE_URL_OVERRIDE] = url }
    }

    suspend fun clearOverride() {
        dataStore.edit { it.remove(KEY_API_BASE_URL_OVERRIDE) }
    }

    private companion object {
        const val PREFERENCES_FILE = "api_base_url_override.pb"
        val KEY_API_BASE_URL_OVERRIDE = stringPreferencesKey("api_base_url_override")
    }
}
