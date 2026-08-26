package com.worktime.android.core.storage

import android.content.Context
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.repository.CachedDashboard
import com.worktime.android.data.repository.DashboardCache
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

/**
 * Durable on-disk cache of the last successfully fetched [DashboardResponse] (#1230), so a cold
 * launch with no connectivity can render the user's last-known dashboard instead of a bare error.
 */
class DashboardCacheStore(context: Context) : DashboardCache {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val json = Json { ignoreUnknownKeys = true }
    private val dataStore =
        PreferenceDataStoreFactory.create(
            produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) }
        )

    override suspend fun load(): CachedDashboard? {
        val prefs =
            dataStore.data
                .catch { error -> if (error is IOException) emit(emptyPreferences()) else throw error }
                .firstOrNull() ?: return null
        val dashboardJson = prefs[KEY_DASHBOARD_JSON] ?: return null
        val cachedAt = prefs[KEY_CACHED_AT] ?: return null
        val dashboard =
            runCatching { json.decodeFromString(DashboardResponse.serializer(), dashboardJson) }.getOrNull()
                ?: return null
        return CachedDashboard(dashboard = dashboard, cachedAt = cachedAt)
    }

    override suspend fun save(dashboard: DashboardResponse, cachedAt: String) {
        val dashboardJson = json.encodeToString(DashboardResponse.serializer(), dashboard)
        dataStore.edit {
            it[KEY_DASHBOARD_JSON] = dashboardJson
            it[KEY_CACHED_AT] = cachedAt
        }
    }

    override fun clear() {
        scope.launch { dataStore.edit { it.clear() } }
    }

    private companion object {
        const val PREFERENCES_FILE = "dashboard_cache"
        val KEY_DASHBOARD_JSON = stringPreferencesKey("dashboard_json")
        val KEY_CACHED_AT = stringPreferencesKey("cached_at")
    }
}
