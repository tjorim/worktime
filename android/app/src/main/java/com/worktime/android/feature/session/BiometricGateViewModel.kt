package com.worktime.android.feature.session

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.worktime.android.core.auth.BiometricGateDecision
import com.worktime.android.core.storage.BiometricLockPreferences
import com.worktime.android.core.storage.BiometricLockPreferencesSource
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/**
 * Drives the opt-in app-lock: records when the app is backgrounded, and decides (via
 * [BiometricGateDecision]) whether the configured idle timeout has elapsed and the
 * biometric/device-credential prompt must be shown again before any data is visible.
 *
 * [lockState] starts as [AppLockState.Resolving] and only leaves it once the persisted
 * preferences have been read, so a cold start (including process restore) never renders
 * authenticated content before the decision exists.
 */
class BiometricGateViewModel(
    private val preferencesStore: BiometricLockPreferencesSource,
    private val clock: () -> Long = System::currentTimeMillis
) : ViewModel() {
    val preferences: StateFlow<BiometricLockPreferences> =
        preferencesStore.preferences.stateIn(
            scope = viewModelScope,
            started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
            initialValue = BiometricLockPreferences()
        )

    private val _lockState = MutableStateFlow<AppLockState>(AppLockState.Resolving)
    val lockState: StateFlow<AppLockState> = _lockState.asStateFlow()

    private val _promptInProgress = MutableStateFlow(false)

    /**
     * True only while a prompt launched from the current host is outstanding. It is not persisted, so
     * process death resets it, and [onPromptHostDetached] resets it when the host is torn down.
     */
    val promptInProgress: StateFlow<Boolean> = _promptInProgress.asStateFlow()

    // DataStore writes are async; without this, a quick background/resume can read a stale
    // (or not-yet-persisted) timestamp from disk and lock the app even though it never idled.
    private var lastBackgroundEpochMillis: Long? = null

    // Latest persisted preferences, so a warm resume can be decided synchronously and never
    // composes content while an asynchronous read is pending. Null until the first read.
    private var knownPreferences: BiometricLockPreferences? = null

    init {
        viewModelScope.launch {
            preferencesStore.preferences.collect { prefs ->
                knownPreferences = prefs
                if (_lockState.value == AppLockState.Resolving) resolveColdStart(prefs)
            }
        }
    }

    private fun resolveColdStart(prefs: BiometricLockPreferences) {
        val lock =
            BiometricGateDecision.shouldLockOnColdStart(
                lockEnabled = prefs.lockEnabled,
                idleTimeoutMinutes = prefs.idleTimeoutMinutes,
                lastBackgroundEpochMillis = lastBackgroundEpochMillis ?: prefs.lastBackgroundEpochMillis,
                nowEpochMillis = clock()
            )
        _lockState.value = if (lock) AppLockState.Locked else AppLockState.Unlocked
    }

    fun onAppBackgrounded(nowEpochMillis: Long) {
        lastBackgroundEpochMillis = nowEpochMillis
        viewModelScope.launch {
            preferencesStore.setLastBackgroundEpochMillis(nowEpochMillis)
        }
    }

    fun onAppResumed(nowEpochMillis: Long) {
        // Still resolving (first read pending): the cold-start decision covers this resume.
        val prefs = knownPreferences ?: return
        if (_lockState.value != AppLockState.Unlocked) return
        if (BiometricGateDecision.shouldRequireAuthentication(
                lockEnabled = prefs.lockEnabled,
                idleTimeoutMinutes = prefs.idleTimeoutMinutes,
                lastBackgroundEpochMillis = lastBackgroundEpochMillis ?: prefs.lastBackgroundEpochMillis,
                nowEpochMillis = nowEpochMillis
            )
        ) {
            _lockState.value = AppLockState.Locked
        }
    }

    fun onPromptStarted() {
        _promptInProgress.value = true
    }

    fun onPromptFinished() {
        _promptInProgress.value = false
    }

    /** The activity hosting the prompt was destroyed or recreated; any outstanding prompt state is stale. */
    fun onPromptHostDetached() {
        _promptInProgress.value = false
    }

    fun onAuthenticationSucceeded() {
        _promptInProgress.value = false
        _lockState.value = AppLockState.Unlocked
    }

    fun setLockEnabled(enabled: Boolean) {
        viewModelScope.launch { preferencesStore.setLockEnabled(enabled) }
    }

    fun setIdleTimeoutMinutes(minutes: Int) {
        viewModelScope.launch { preferencesStore.setIdleTimeoutMinutes(minutes) }
    }

    companion object {
        private const val STOP_TIMEOUT_MILLIS = 5_000L

        fun factory(preferencesStore: BiometricLockPreferencesSource): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                BiometricGateViewModel(preferencesStore = preferencesStore)
            }
        }
    }
}
