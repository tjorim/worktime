package com.worktime.android.data.repository

import com.worktime.android.data.model.DashboardResponse
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class WorktimeRepositoryDashboardCacheTest {
    @Test
    fun loadDashboardCachesSuccessfulResponse() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache()
        val repository =
            WorktimeRepository(
                api = FakeApi(response = dashboard),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        repository.loadDashboard()

        assertEquals(dashboard, cache.savedDashboard)
        assertTrue(!cache.savedCachedAt.isNullOrBlank())
    }

    @Test
    fun loadDashboardSucceedsEvenWhenCachePersistenceFails() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache(saveThrowable = IOException("disk full"))
        val repository =
            WorktimeRepository(
                api = FakeApi(response = dashboard),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        val result = repository.loadDashboard()

        assertEquals(DashboardLoadResult.Success(dashboard), result)
    }

    @Test
    fun loadDashboardClearsCacheOnUnauthorized() = runTest {
        val cache = FakeDashboardCache()
        cache.save(sampleDashboard(), "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(dashboardThrowable = httpException(401)),
                sessionController = FakeSessionController(token = "expired-token"),
                cache = cache
            )

        repository.loadDashboard()

        assertEquals(1, cache.clearCallCount)
        assertEquals(null, cache.load())
    }

    @Test
    fun loadCachedDashboardDelegatesToTheCache() = runTest {
        val dashboard = sampleDashboard()
        val cache = FakeDashboardCache()
        cache.save(dashboard, "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        val result = repository.loadCachedDashboard()

        assertEquals(CachedDashboard(dashboard, "2026-05-26T12:00:00Z"), result)
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
        cache.save(sampleDashboard(), "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        repository.completeLogout()

        assertEquals(1, cache.clearCallCount)
    }

    @Test
    fun deleteAccountClearsCacheOnSuccess() = runTest {
        val cache = FakeDashboardCache()
        cache.save(sampleDashboard(), "2026-05-26T12:00:00Z")
        val repository =
            WorktimeRepository(
                api = FakeApi(),
                sessionController = FakeSessionController(token = "token-123"),
                cache = cache
            )

        val result = repository.deleteAccount()

        assertTrue(result is MutationResult.Success)
        assertEquals(1, cache.clearCallCount)
    }

    private class FakeDashboardCache(private val saveThrowable: Throwable? = null) : DashboardCache {
        var savedDashboard: DashboardResponse? = null
            private set
        var savedCachedAt: String? = null
            private set
        var clearCallCount = 0
            private set

        override suspend fun load(): CachedDashboard? =
            savedDashboard?.let { CachedDashboard(it, requireNotNull(savedCachedAt)) }

        override suspend fun save(dashboard: DashboardResponse, cachedAt: String) {
            saveThrowable?.let { throw it }
            savedDashboard = dashboard
            savedCachedAt = cachedAt
        }

        override suspend fun clear() {
            clearCallCount++
            savedDashboard = null
            savedCachedAt = null
        }
    }
}
