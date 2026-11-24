package com.worktime.android.data.repository

import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.model.DashboardResponse
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val ENVIRONMENT = "https://api.example"
private const val ACCOUNT_A = "account-a"
private const val ACCOUNT_B = "account-b"
private const val KEY_A = "$ENVIRONMENT|$ACCOUNT_A"
private const val KEY_B = "$ENVIRONMENT|$ACCOUNT_B"
private const val CACHED_AT = "2026-05-26T12:00:00Z"

@OptIn(ExperimentalCoroutinesApi::class)
class WorktimeRepositoryDashboardCacheTest {
    private var environment = ENVIRONMENT

    private fun repository(api: FakeApi, session: FakeSessionController, cache: DashboardCache) = WorktimeRepository(
        api = api,
        sessionController = session,
        cache = cache,
        environmentKey = { environment }
    )

    @Test
    fun loadDashboardCachesSuccessfulResponse() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache()
        val repository =
            repository(FakeApi(response = dashboard), FakeSessionController(token = "token-123"), cache)

        repository.loadDashboard()

        assertEquals(dashboard, cache.savedDashboard)
        assertEquals(KEY_A, cache.savedKey)
        assertTrue(!cache.savedCachedAt.isNullOrBlank())
    }

    @Test
    fun loadDashboardSucceedsEvenWhenCachePersistenceFails() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache(saveThrowable = IOException("disk full"))
        val repository =
            repository(FakeApi(response = dashboard), FakeSessionController(token = "token-123"), cache)

        val result = repository.loadDashboard()

        assertEquals(DashboardLoadResult.Success(dashboard), result)
    }

    @Test
    fun loadDashboardClearsCacheOnUnauthorized() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val repository =
            repository(
                FakeApi(dashboardThrowable = httpException(401)),
                FakeSessionController(token = "expired-token"),
                cache
            )

        repository.loadDashboard()

        assertEquals(1, cache.clearCallCount)
        assertNull(cache.load(KEY_A))
    }

    @Test
    fun loadCachedDashboardDelegatesToTheCache() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache()
        cache.save(KEY_A, dashboard, CACHED_AT)
        val repository =
            repository(FakeApi(), FakeSessionController(token = "token-123"), cache)

        val result = repository.loadCachedDashboard()

        assertEquals(CachedDashboard(dashboard, CACHED_AT), result)
    }

    @Test
    fun loadCachedDashboardReturnsNullWithoutACache() = runTest {
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123")
            )

        assertEquals(null, repository.loadCachedDashboard())
    }

    @Test
    fun completeLogoutClearsCache() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val repository =
            repository(FakeApi(), FakeSessionController(token = "token-123"), cache)

        repository.completeLogout()

        assertEquals(1, cache.clearCallCount)
    }

    @Test
    fun deleteAccountClearsCacheOnSuccess() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val repository =
            repository(FakeApi(), FakeSessionController(token = "token-123"), cache)

        val result = repository.deleteAccount()

        assertTrue(result is MutationResult.Success)
        assertEquals(1, cache.clearCallCount)
    }

    @Test
    fun cachedDashboardIsNotServedToAnotherAccount() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val session = FakeSessionController(token = "token-a")
        val repository = repository(FakeApi(), session, cache)
        assertEquals(CachedDashboard(sampleDashboard(), CACHED_AT), repository.loadCachedDashboard())

        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)

        assertNull(repository.loadCachedDashboard())
    }

    @Test
    fun cachedDashboardIsNotServedForAnotherEnvironment() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val repository = repository(FakeApi(), FakeSessionController(token = "token-a"), cache)

        environment = "https://staging.example"

        assertNull(repository.loadCachedDashboard())
    }

    @Test
    fun cachedDashboardIsNotServedWhileSignedOut() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val repository = repository(FakeApi(), FakeSessionController(token = null), cache)

        assertNull(repository.loadCachedDashboard())
    }

    @Test
    fun nothingIsCachedForASessionWithoutAnIdentity() = runTest {
        val cache = FakeDashboardCache()
        val session = FakeSessionController(token = "token", accountKey = null)
        val repository = repository(FakeApi(), session, cache)

        assertTrue(repository.loadDashboard() is DashboardLoadResult.Success)

        assertNull(cache.savedDashboard)
        assertNull(repository.loadCachedDashboard())
    }

    @Test
    fun secondAccountNeverSeesFirstAccountsDataAfterRevokedRefreshAndFailedLoad() = runTest {
        // Account A is signed out by a revoked refresh token (the session controller reports no token
        // and no one clears the cache), then B signs in and its first dashboard load fails.
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val session = FakeSessionController(token = null)
        val repository = repository(FakeApi(dashboardThrowable = IOException("offline")), session, cache)
        assertEquals(DashboardLoadResult.LoggedOut, repository.loadDashboard())
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)

        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)

        assertNull(repository.loadCachedDashboard())
        assertTrue(repository.loadDashboard() is DashboardLoadResult.Error)
        assertNull(repository.loadCachedDashboard())
    }

    @Test
    fun revokedRefreshClearsTheCacheOnDashboardLoad() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val repository = repository(FakeApi(), FakeSessionController(token = null), cache)

        assertEquals(DashboardLoadResult.LoggedOut, repository.loadDashboard())

        assertEquals(1, cache.clearCallCount)
        assertNull(cache.savedDashboard)
    }

    @Test
    fun revokedRefreshClearsTheCacheOnActions() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val repository = repository(FakeApi(), FakeSessionController(token = null), cache)

        assertEquals(MutationResult.LoggedOut, repository.startTimeTracking("Task"))

        assertEquals(1, cache.clearCallCount)
    }

    @Test
    fun unauthorizedActionSignsOutAndClearsTheCache() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_A, sampleDashboard(), CACHED_AT)
        val session = FakeSessionController(token = "expired")
        val repository = repository(FakeApi(taskThrowable = httpException(401)), session, cache)

        assertEquals(MutationResult.LoggedOut, repository.startTimeTracking("Task"))

        assertEquals(1, session.logoutCallCount)
        assertEquals(1, cache.clearCallCount)
    }

    @Test
    fun logoutDuringALoadDiscardsTheResponse() = runTest {
        val cache = FakeDashboardCache()
        val api = FakeApi().apply { gate = CompletableDeferred() }
        val session = FakeSessionController(token = "token-a")
        val repository = repository(api, session, cache)
        val load = async { repository.loadDashboard() }
        runCurrent()

        session.logout()
        api.gate?.complete(Unit)

        assertEquals(DashboardLoadResult.Superseded, load.await())
        assertNull(cache.savedDashboard)
    }

    @Test
    fun accountSwitchDuringALoadDiscardsTheResponse() = runTest {
        val cache = FakeDashboardCache()
        val api = FakeApi().apply { gate = CompletableDeferred() }
        val session = FakeSessionController(token = "token-a")
        val repository = repository(api, session, cache)
        val load = async { repository.loadDashboard() }
        runCurrent()

        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)
        api.gate?.complete(Unit)

        assertEquals(DashboardLoadResult.Superseded, load.await())
        assertNull(cache.load(KEY_A))
        assertNull(cache.load(KEY_B))
    }

    @Test
    fun staleUnauthorizedLoadDoesNotSignOutTheNewSession() = runTest {
        val cache = FakeDashboardCache()
        val api = FakeApi(dashboardThrowable = httpException(401)).apply { gate = CompletableDeferred() }
        val session = FakeSessionController(token = "token-a")
        val repository = repository(api, session, cache)
        val load = async { repository.loadDashboard() }
        runCurrent()
        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)
        cache.save(KEY_B, sampleDashboard(), CACHED_AT)

        api.gate?.complete(Unit)

        assertEquals(DashboardLoadResult.Superseded, load.await())
        assertEquals(0, session.logoutCallCount)
        assertEquals(0, cache.clearCallCount)
        assertTrue(session.sessionState.value is SessionState.Authenticated)
    }

    @Test
    fun staleUnauthorizedActionDoesNotSignOutTheNewSession() = runTest {
        val cache = FakeDashboardCache()
        val api = FakeApi(taskThrowable = httpException(401)).apply { gate = CompletableDeferred() }
        val session = FakeSessionController(token = "token-a")
        val repository = repository(api, session, cache)
        val action = async { repository.startTimeTracking("Task") }
        runCurrent()
        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)

        api.gate?.complete(Unit)

        assertEquals(MutationResult.Superseded, action.await())
        assertEquals(0, session.logoutCallCount)
        assertEquals(0, cache.clearCallCount)
    }

    @Test
    fun staleActionFailureIsNotReportedToTheNewSession() = runTest {
        val api = FakeApi(taskThrowable = IOException("offline")).apply { gate = CompletableDeferred() }
        val session = FakeSessionController(token = "token-a")
        val repository = repository(api, session, FakeDashboardCache())
        val action = async { repository.startTimeTracking("Task") }
        runCurrent()
        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)

        api.gate?.complete(Unit)

        assertEquals(MutationResult.Superseded, action.await())
    }

    @Test
    fun actionWaitingForATokenIsNotSentAsTheNextAccount() = runTest {
        val api = FakeApi()
        val session = FakeSessionController(token = "token-a").apply { tokenGate = CompletableDeferred() }
        val repository = repository(api, session, FakeDashboardCache())
        val action = async { repository.startTimeTracking("Task") }
        runCurrent()

        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)
        session.tokenGate?.complete(Unit)

        assertEquals(MutationResult.Superseded, action.await())
        assertEquals(0, api.createTaskCallCount)
    }

    @Test
    fun loadWaitingForATokenIsNotSentAsTheNextAccount() = runTest {
        val api = FakeApi()
        val session = FakeSessionController(token = "token-a").apply { tokenGate = CompletableDeferred() }
        val repository = repository(api, session, FakeDashboardCache())
        val load = async { repository.loadDashboard() }
        runCurrent()

        session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B)
        session.tokenGate?.complete(Unit)

        assertEquals(DashboardLoadResult.Superseded, load.await())
        assertEquals(0, api.getDashboardCallCount)
    }

    @Test
    fun signInDuringTheCacheWriteDoesNotHandTheDashboardToTheNewSession() = runTest {
        val cache = FakeDashboardCache()
        val session = FakeSessionController(token = "token-a")
        cache.duringSave = { session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B) }
        val repository = repository(FakeApi(), session, cache)

        assertEquals(DashboardLoadResult.Superseded, repository.loadDashboard())
    }

    @Test
    fun signInDuringUnauthorizedLogoutKeepsTheNewSessionAndItsCache() = runTest {
        val cache = FakeDashboardCache()
        cache.save(KEY_B, sampleDashboard(), CACHED_AT)
        val session = FakeSessionController(token = "token-a")
        session.duringLogout = { session.signIn(token = "token-b", sessionId = 2, accountKey = ACCOUNT_B) }
        val repository = repository(FakeApi(taskThrowable = httpException(401)), session, cache)

        assertEquals(MutationResult.LoggedOut, repository.startTimeTracking("Task"))

        assertTrue(session.sessionState.value is SessionState.Authenticated)
        assertEquals(0, cache.clearCallCount)
        assertEquals(CachedDashboard(sampleDashboard(), CACHED_AT), cache.load(KEY_B))
    }

    @Test
    fun environmentChangeDuringALoadDiscardsTheResponse() = runTest {
        val cache = FakeDashboardCache()
        val api = FakeApi().apply { gate = CompletableDeferred() }
        val repository = repository(api, FakeSessionController(token = "token-a"), cache)
        val load = async { repository.loadDashboard() }
        runCurrent()

        environment = "https://staging.example"
        api.gate?.complete(Unit)

        assertEquals(DashboardLoadResult.Superseded, load.await())
        assertNull(cache.savedDashboard)
    }

    private class FakeDashboardCache(private val saveThrowable: Throwable? = null) : DashboardCache {
        var duringSave: (suspend () -> Unit)? = null
        var savedKey: String? = null
            private set
        var savedDashboard: DashboardResponse? = null
            private set
        var savedCachedAt: String? = null
            private set
        var clearCallCount = 0
            private set

        override suspend fun load(accountKey: String): CachedDashboard? = savedDashboard?.takeIf {
            savedKey == accountKey
        }?.let { CachedDashboard(it, requireNotNull(savedCachedAt)) }

        override suspend fun save(accountKey: String, dashboard: DashboardResponse, cachedAt: String) {
            saveThrowable?.let { throw it }
            duringSave?.invoke()
            savedKey = accountKey
            savedDashboard = dashboard
            savedCachedAt = cachedAt
        }

        override suspend fun clear() {
            clearCallCount++
            savedKey = null
            savedDashboard = null
            savedCachedAt = null
        }
    }
}
