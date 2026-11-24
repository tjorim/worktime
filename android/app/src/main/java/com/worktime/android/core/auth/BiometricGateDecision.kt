package com.worktime.android.core.auth

/**
 * Pure idle-timeout decision for the app-lock gate, kept independent of `BiometricPrompt`
 * so it can be unit tested without an Activity or real biometric hardware.
 */
object BiometricGateDecision {
    fun shouldRequireAuthentication(
        lockEnabled: Boolean,
        idleTimeoutMinutes: Int,
        lastBackgroundEpochMillis: Long?,
        nowEpochMillis: Long
    ): Boolean {
        if (!lockEnabled) return false
        if (lastBackgroundEpochMillis == null) return false
        val idleMillis = nowEpochMillis - lastBackgroundEpochMillis
        val timeoutMillis = idleTimeoutMinutes.coerceAtLeast(0) * MILLIS_PER_MINUTE
        return idleMillis >= timeoutMillis
    }

    /**
     * Decision for a freshly created process, where no in-memory backgrounding was observed. A missing
     * timestamp means the previous session ended without recording one (killed before it was persisted),
     * so an enabled lock fails closed instead of treating the launch as a quick return.
     */
    fun shouldLockOnColdStart(
        lockEnabled: Boolean,
        idleTimeoutMinutes: Int,
        lastBackgroundEpochMillis: Long?,
        nowEpochMillis: Long
    ): Boolean {
        if (!lockEnabled) return false
        if (lastBackgroundEpochMillis == null) return true
        return shouldRequireAuthentication(lockEnabled, idleTimeoutMinutes, lastBackgroundEpochMillis, nowEpochMillis)
    }

    private const val MILLIS_PER_MINUTE = 60_000L
}
