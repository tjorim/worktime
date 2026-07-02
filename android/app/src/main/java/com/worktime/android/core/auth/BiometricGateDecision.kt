package com.worktime.android.core.auth

/**
 * Pure idle-timeout decision for the app-lock gate, kept independent of `BiometricPrompt`
 * so it can be unit tested without an Activity or real biometric hardware.
 */
object BiometricGateDecision {
    fun shouldRequireAuthentication(lockEnabled: Boolean, idleTimeoutMinutes: Int, lastBackgroundEpochMillis: Long?, nowEpochMillis: Long): Boolean {
        if (!lockEnabled) return false
        if (lastBackgroundEpochMillis == null) return true
        val idleMillis = nowEpochMillis - lastBackgroundEpochMillis
        val timeoutMillis = idleTimeoutMinutes.coerceAtLeast(0) * MILLIS_PER_MINUTE
        return idleMillis >= timeoutMillis
    }

    private const val MILLIS_PER_MINUTE = 60_000L
}
