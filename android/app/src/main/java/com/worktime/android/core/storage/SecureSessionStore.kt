package com.worktime.android.core.storage

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SecureSessionStore @Inject constructor(@ApplicationContext context: Context) {
    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build()
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun readAuthStateJson(): String? = runCatching { prefs.getString(KEY_AUTH_STATE, null) }.getOrNull()

    fun writeAuthStateJson(value: String) {
        runCatching { prefs.edit().putString(KEY_AUTH_STATE, value).apply() }
    }

    fun clear() {
        runCatching { prefs.edit().clear().apply() }
    }

    private companion object {
        const val PREFS_NAME = "worktime_android_secure_session"
        const val KEY_AUTH_STATE = "auth_state"
    }
}
