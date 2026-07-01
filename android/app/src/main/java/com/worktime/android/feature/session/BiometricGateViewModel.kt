package com.worktime.android.feature.session

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.worktime.android.core.auth.BiometricGateDecision
import com.worktime.android.core.storage.BiometricLockPreferences
import com.worktime.android.core.storage.BiometricLockPreferencesStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Drives the opt-in app-lock: records when the app is backgrounded, and on resume decides
 * (via [BiometricGateDecision]) whether the configured idle timeout has elapsed and the
 * biometric/device-credential prompt must be shown again before any data is visible.
 */
class BiometricGateViewModel(private val preferencesStore: BiometricLockPreferencesStore) : ViewModel() {
    val preferences: StateFlow<BiometricLockPreferences> =
        preferencesStore.preferences.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = BiometricLockPreferences()
        )

    private val _locked = MutableStateFlow(false)
    val locked: StateFlow<Boolean> = _locked.asStateFlow()

    // DataStore writes are async; without this, a quick background/resume can read a stale
    // (or not-yet-persisted) timestamp from disk and lock the app even though it never idled.
    private var lastBackgroundEpochMillis: Long? = null

    fun onAppBackgrounded(nowEpochMillis: Long) {
        lastBackgroundEpochMillis = nowEpochMillis
        viewModelScope.launch {
            preferencesStore.setLastBackgroundEpochMillis(nowEpochMillis)
        }
    }

    fun onAppResumed(nowEpochMillis: Long) {
        viewModelScope.launch {
            val prefs = preferencesStore.preferences.first()
            if (BiometricGateDecision.shouldRequireAuthentication(
                    lockEnabled = prefs.lockEnabled,
                    idleTimeoutMinutes = prefs.idleTimeoutMinutes,
                    lastBackgroundEpochMillis = lastBackgroundEpochMillis ?: prefs.lastBackgroundEpochMillis,
                    nowEpochMillis = nowEpochMillis
                )
            ) {
                _locked.value = true
            }
        }
    }

    fun onAuthenticationSucceeded() {
        _locked.value = false
    }

    fun setLockEnabled(enabled: Boolean) {
        viewModelScope.launch { preferencesStore.setLockEnabled(enabled) }
    }

    fun setIdleTimeoutMinutes(minutes: Int) {
        viewModelScope.launch { preferencesStore.setIdleTimeoutMinutes(minutes) }
    }

    companion object {
        private const val STOP_TIMEOUT_MILLIS = 5_000L

        fun factory(preferencesStore: BiometricLockPreferencesStore): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                BiometricGateViewModel(preferencesStore = preferencesStore)
            }
        }
    }
}
