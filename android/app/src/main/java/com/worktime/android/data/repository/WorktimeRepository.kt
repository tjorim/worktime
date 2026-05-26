package com.worktime.android.data.repository

import com.worktime.android.core.auth.SessionController
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.model.DashboardResponse
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import retrofit2.HttpException
import java.io.IOException
import java.util.TimeZone

sealed interface DashboardLoadResult {
    data class Success(val dashboard: DashboardResponse) : DashboardLoadResult
    data object LoggedOut : DashboardLoadResult
    data class Error(val message: String) : DashboardLoadResult
}

interface DashboardRepository {
    val sessionState: StateFlow<SessionState>
    suspend fun loadDashboard(): DashboardLoadResult
    fun logout()
}

class WorktimeRepository(
    private val api: WorktimeApi,
    private val sessionController: SessionController,
) : DashboardRepository {
    override val sessionState: StateFlow<SessionState> = sessionController.sessionState

    override suspend fun loadDashboard(): DashboardLoadResult {
        val token = sessionController.getFreshAccessToken() ?: return DashboardLoadResult.LoggedOut
        val timezone = TimeZone.getDefault().id
        return try {
            DashboardLoadResult.Success(api.getDashboard(authorization = "Bearer $token", timezone = timezone))
        } catch (error: HttpException) {
            if (error.code() == 401) {
                sessionController.logout()
                DashboardLoadResult.LoggedOut
            } else {
                DashboardLoadResult.Error("Unable to load Worktime data (${error.code()})")
            }
        } catch (_: IOException) {
            DashboardLoadResult.Error("Unable to reach the Worktime backend")
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            DashboardLoadResult.Error(error.message ?: "Unable to load Worktime data")
        }
    }

    override fun logout() {
        sessionController.logout()
    }
}
