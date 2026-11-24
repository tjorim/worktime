package com.worktime.android.feature.session

import com.worktime.android.core.storage.BiometricLockPreferences
import com.worktime.android.core.storage.BiometricLockPreferencesSource
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class BiometricGateViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        kotlinx.coroutines.Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        kotlinx.coroutines.Dispatchers.resetMain()
    }

    @Test
    fun firstFrameIsResolvingUntilPreferencesAreRead() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })

        assertEquals(AppLockState.Resolving, viewModel.lockState.value)
        advanceUntilIdle()
        assertEquals(AppLockState.Resolving, viewModel.lockState.value)

        source.publish(BiometricLockPreferences(lockEnabled = false))
        advanceUntilIdle()
        assertEquals(AppLockState.Unlocked, viewModel.lockState.value)
    }

    @Test
    fun coldStartWithExpiredLockIsLockedWithoutEverBeingUnlocked() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })
        val observed = mutableListOf<AppLockState>()
        val job = backgroundScope.launch { viewModel.lockState.collect { observed += it } }

        source.publish(expiredPreferences())
        advanceUntilIdle()

        assertEquals(AppLockState.Locked, viewModel.lockState.value)
        assertFalse(AppLockState.Unlocked in observed)
        job.cancel()
    }

    @Test
    fun coldStartWithinIdleWindowIsUnlocked() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })

        source.publish(
            BiometricLockPreferences(
                lockEnabled = true,
                idleTimeoutMinutes = 5,
                lastBackgroundEpochMillis = NOW - 60_000L
            )
        )
        advanceUntilIdle()

        assertEquals(AppLockState.Unlocked, viewModel.lockState.value)
    }

    @Test
    fun coldStartWithLockEnabledAndNoRecordedBackgroundFailsClosed() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })

        source.publish(BiometricLockPreferences(lockEnabled = true, lastBackgroundEpochMillis = null))
        advanceUntilIdle()

        assertEquals(AppLockState.Locked, viewModel.lockState.value)
    }

    @Test
    fun resumeWhileStillResolvingDoesNotDecide() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })

        viewModel.onAppResumed(NOW)
        advanceUntilIdle()

        assertEquals(AppLockState.Resolving, viewModel.lockState.value)
    }

    @Test
    fun warmResumeAfterIdleTimeoutLocksSynchronously() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })
        source.publish(BiometricLockPreferences(lockEnabled = true, idleTimeoutMinutes = 1))
        advanceUntilIdle()
        viewModel.onAuthenticationSucceeded()

        viewModel.onAppBackgrounded(NOW)
        viewModel.onAppResumed(NOW + 2 * 60_000L)

        // No scheduler advance: the decision must already be in place when the resume event returns.
        assertEquals(AppLockState.Locked, viewModel.lockState.value)
    }

    @Test
    fun warmResumeWithinIdleTimeoutStaysUnlocked() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })
        source.publish(BiometricLockPreferences(lockEnabled = true, idleTimeoutMinutes = 5))
        advanceUntilIdle()
        viewModel.onAuthenticationSucceeded()

        viewModel.onAppBackgrounded(NOW)
        viewModel.onAppResumed(NOW + 60_000L)

        assertEquals(AppLockState.Unlocked, viewModel.lockState.value)
    }

    @Test
    fun inMemoryBackgroundTimestampWinsOverStalePersistedValue() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })
        source.publish(expiredPreferences())
        advanceUntilIdle()
        viewModel.onAuthenticationSucceeded()

        viewModel.onAppBackgrounded(NOW)
        viewModel.onAppResumed(NOW + 1_000L)

        assertEquals(AppLockState.Unlocked, viewModel.lockState.value)
    }

    @Test
    fun resumeKeepsAnEngagedLockUntilAuthenticationSucceeds() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })
        source.publish(expiredPreferences())
        advanceUntilIdle()

        viewModel.onAppBackgrounded(NOW)
        viewModel.onAppResumed(NOW + 1_000L)
        assertEquals(AppLockState.Locked, viewModel.lockState.value)

        viewModel.onAuthenticationSucceeded()
        assertEquals(AppLockState.Unlocked, viewModel.lockState.value)
    }

    @Test
    fun promptFlagTracksTheOutstandingPrompt() = runTest(dispatcher) {
        val viewModel = BiometricGateViewModel(FakeSource(), clock = { NOW })
        assertFalse(viewModel.promptInProgress.value)

        viewModel.onPromptStarted()
        assertTrue(viewModel.promptInProgress.value)

        viewModel.onPromptFinished()
        assertFalse(viewModel.promptInProgress.value)
    }

    @Test
    fun successfulAuthenticationClearsThePromptFlag() = runTest(dispatcher) {
        val viewModel = BiometricGateViewModel(FakeSource(), clock = { NOW })

        viewModel.onPromptStarted()
        viewModel.onAuthenticationSucceeded()

        assertFalse(viewModel.promptInProgress.value)
        assertEquals(AppLockState.Unlocked, viewModel.lockState.value)
    }

    @Test
    fun promptFlagResetsWhenTheHostIsRecreated() = runTest(dispatcher) {
        val viewModel = BiometricGateViewModel(FakeSource(), clock = { NOW })
        viewModel.onPromptStarted()

        viewModel.onPromptHostDetached()

        assertFalse(viewModel.promptInProgress.value)
    }

    @Test
    fun promptFlagIsNotCarriedAcrossProcessRecreation() = runTest(dispatcher) {
        val source = FakeSource()
        val first = BiometricGateViewModel(source, clock = { NOW })
        first.onPromptStarted()

        val recreated = BiometricGateViewModel(source, clock = { NOW })

        assertFalse(recreated.promptInProgress.value)
        assertEquals(AppLockState.Resolving, recreated.lockState.value)
    }

    @Test
    fun backgroundingPersistsTheTimestamp() = runTest(dispatcher) {
        val source = FakeSource()
        val viewModel = BiometricGateViewModel(source, clock = { NOW })

        viewModel.onAppBackgrounded(NOW)
        advanceUntilIdle()

        assertEquals(listOf(NOW), source.backgroundWrites)
    }

    private fun expiredPreferences(): BiometricLockPreferences = BiometricLockPreferences(
        lockEnabled = true,
        idleTimeoutMinutes = 1,
        lastBackgroundEpochMillis = NOW - 10 * 60_000L
    )

    private class FakeSource : BiometricLockPreferencesSource {
        private val flow = MutableSharedFlow<BiometricLockPreferences>(replay = 1)
        val backgroundWrites = mutableListOf<Long>()

        override val preferences: Flow<BiometricLockPreferences> = flow

        suspend fun publish(preferences: BiometricLockPreferences) = flow.emit(preferences)

        override suspend fun setLockEnabled(value: Boolean) = Unit

        override suspend fun setIdleTimeoutMinutes(value: Int) = Unit

        override suspend fun setLastBackgroundEpochMillis(value: Long) {
            backgroundWrites += value
        }
    }

    private companion object {
        const val NOW = 1_700_000_000_000L
    }
}
