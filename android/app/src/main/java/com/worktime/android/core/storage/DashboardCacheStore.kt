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
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.serialization.json.Json

/**
 * Durable on-disk cache of the last successfully fetched [DashboardResponse] (#1230), so a cold
 * launch with no connectivity can render the user's last-known dashboard instead of a bare error.
 * The single entry records the account/environment key it was written for and is only returned to
 * that same key (#2092).
 */
class DashboardCacheStore(context: Context) : DashboardCache {
    private val json = Json { ignoreUnknownKeys = true }
    private val dataStore =
        PreferenceDataStoreFactory.create(
            produceFile = { context.preferencesDataStoreFile(PREFERENCES_FILE) }
        )

    override suspend fun load(accountKey: String): CachedDashboard? {
        val prefs =
            dataStore.data
                .catch { error -> if (error is IOException) emit(emptyPreferences()) else throw error }
                .firstOrNull() ?: return null
        // An entry written for another principal or API environment (or by a build that did not
        // record one) is never served, even if it was left behind by a sign-out that missed clear().
        if (prefs[KEY_ACCOUNT_KEY] != accountKey) return null
        val dashboardJson = prefs[KEY_DASHBOARD_JSON] ?: return null
        val cachedAt = prefs[KEY_CACHED_AT] ?: return null
        val dashboard =
            runCatching { json.decodeFromString(DashboardResponse.serializer(), dashboardJson) }.getOrNull()
                ?: return null
        return CachedDashboard(dashboard = dashboard, cachedAt = cachedAt)
    }

    override suspend fun save(accountKey: String, dashboard: DashboardResponse, cachedAt: String) {
        val dashboardJson = json.encodeToString(DashboardResponse.serializer(), dashboard)
        dataStore.edit {
            it[KEY_ACCOUNT_KEY] = accountKey
            it[KEY_DASHBOARD_JSON] = dashboardJson
            it[KEY_CACHED_AT] = cachedAt
        }
    }

    override suspend fun clear() {
        dataStore.edit { it.clear() }
    }

    private companion object {
        const val PREFERENCES_FILE = "dashboard_cache"
        val KEY_ACCOUNT_KEY = stringPreferencesKey("account_key")
        val KEY_DASHBOARD_JSON = stringPreferencesKey("dashboard_json")
        val KEY_CACHED_AT = stringPreferencesKey("cached_at")
    }
}
