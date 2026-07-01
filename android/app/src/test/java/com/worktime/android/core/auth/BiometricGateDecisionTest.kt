package com.worktime.android.core.auth

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BiometricGateDecisionTest {
    @Test
    fun `does not require authentication when lock is disabled`() {
        assertFalse(
            BiometricGateDecision.shouldRequireAuthentication(
                lockEnabled = false,
                idleTimeoutMinutes = 1,
                lastBackgroundEpochMillis = 0L,
                nowEpochMillis = 60_000L
            )
        )
    }

    @Test
    fun `requires authentication when there is no recorded background timestamp`() {
        assertTrue(
            BiometricGateDecision.shouldRequireAuthentication(
                lockEnabled = true,
                idleTimeoutMinutes = 5,
                lastBackgroundEpochMillis = null,
                nowEpochMillis = 1_000L
            )
        )
    }

    @Test
    fun `does not require authentication before the idle timeout elapses`() {
        assertFalse(
            BiometricGateDecision.shouldRequireAuthentication(
                lockEnabled = true,
                idleTimeoutMinutes = 5,
                lastBackgroundEpochMillis = 0L,
                nowEpochMillis = 4 * 60_000L
            )
        )
    }

    @Test
    fun `requires authentication once the idle timeout has elapsed`() {
        assertTrue(
            BiometricGateDecision.shouldRequireAuthentication(
                lockEnabled = true,
                idleTimeoutMinutes = 5,
                lastBackgroundEpochMillis = 0L,
                nowEpochMillis = 5 * 60_000L
            )
        )
    }

    @Test
    fun `requires authentication exactly at the idle timeout boundary`() {
        assertTrue(
            BiometricGateDecision.shouldRequireAuthentication(
                lockEnabled = true,
                idleTimeoutMinutes = 1,
                lastBackgroundEpochMillis = 1_000L,
                nowEpochMillis = 1_000L + 60_000L
            )
        )
    }

    @Test
    fun `treats a negative idle timeout as immediate`() {
        assertTrue(
            BiometricGateDecision.shouldRequireAuthentication(
                lockEnabled = true,
                idleTimeoutMinutes = -1,
                lastBackgroundEpochMillis = 0L,
                nowEpochMillis = 1L
            )
        )
    }
}
