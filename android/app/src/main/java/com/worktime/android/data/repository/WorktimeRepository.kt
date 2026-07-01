package com.worktime.android.data.repository

import com.worktime.android.core.auth.SessionController
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.WorkLocationMutationRequest
import com.worktime.android.data.model.WorkLocationRecord
import java.io.IOException
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.TimeZone
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import retrofit2.HttpException

sealed interface DashboardLoadResult {
    data class Success(val dashboard: DashboardResponse) : DashboardLoadResult

    data object LoggedOut : DashboardLoadResult

    data class Error(val message: String) : DashboardLoadResult
}

sealed interface MutationResult<out T> {
    data class Success<T>(val value: T) : MutationResult<T>

    data object LoggedOut : MutationResult<Nothing>

    data class ValidationError(val message: String) : MutationResult<Nothing>

    data class Error(val message: String) : MutationResult<Nothing>
}

interface DashboardRepository {
    val sessionState: StateFlow<SessionState>

    suspend fun loadDashboard(): DashboardLoadResult

    suspend fun startTimeTracking(text: String, labelId: String? = null): MutationResult<TaskRecord>

    suspend fun stopTimeTracking(taskId: String): MutationResult<TaskRecord>

    suspend fun updateTask(taskId: String, text: String? = null, labelId: String? = null): MutationResult<TaskRecord>

    suspend fun getRunningTask(): MutationResult<TaskRecord?>

    suspend fun setWorkLocation(date: LocalDate, countryCode: String, label: String? = null): MutationResult<WorkLocationRecord>

    suspend fun loadWeeklyWorkLocations(until: LocalDate = LocalDate.now()): MutationResult<List<WorkLocationRecord>>

    suspend fun deleteLabel(labelId: String): MutationResult<Unit>

    suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse>

    fun logout()
}

class WorktimeRepository(private val api: WorktimeApi, private val sessionController: SessionController) : DashboardRepository {
    override val sessionState: StateFlow<SessionState> = sessionController.sessionState
    private var currentUserId: Int? = null

    companion object {
        private const val HTTP_NO_CONTENT = 204
        private const val HTTP_BAD_REQUEST = 400
        private const val HTTP_UNAUTHORIZED = 401
        private const val HTTP_CONFLICT = 409
        private const val WEEK_LOOKBACK_DAYS = 6L
    }

    override suspend fun loadDashboard(): DashboardLoadResult {
        val token = sessionController.getFreshAccessToken() ?: return DashboardLoadResult.LoggedOut
        val timezone = TimeZone.getDefault().id
        return try {
            val dashboard = api.getDashboard(authorization = "Bearer $token", timezone = timezone)
            currentUserId = dashboard.identity.id
            DashboardLoadResult.Success(dashboard)
        } catch (error: HttpException) {
            if (error.code() == HTTP_UNAUTHORIZED) {
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

    override suspend fun startTimeTracking(text: String, labelId: String?): MutationResult<TaskRecord> {
        val now = OffsetDateTime.now(ZoneOffset.UTC).toString()
        return withAuthorizedUser { token, userId ->
            api.createTask(
                authorization = "Bearer $token",
                userId = userId,
                payload =
                TaskMutationRequest(
                    text = text,
                    labelId = labelId,
                    startTime = now,
                    includesBreak = false
                )
            )
        }
    }

    override suspend fun stopTimeTracking(taskId: String): MutationResult<TaskRecord> {
        val now = OffsetDateTime.now(ZoneOffset.UTC).toString()
        return withAuthorizedUser { token, userId ->
            api.updateTask(
                authorization = "Bearer $token",
                taskId = taskId,
                userId = userId,
                payload = TaskMutationRequest(stopTime = now)
            )
        }
    }

    override suspend fun updateTask(taskId: String, text: String?, labelId: String?): MutationResult<TaskRecord> = withAuthorizedUser { token, userId ->
        api.updateTask(
            authorization = "Bearer $token",
            taskId = taskId,
            userId = userId,
            payload = TaskMutationRequest(text = text, labelId = labelId)
        )
    }

    override suspend fun getRunningTask(): MutationResult<TaskRecord?> = withAuthorizedUser { token, userId ->
        val response =
            api.getRunningTask(
                authorization = "Bearer $token",
                userId = userId
            )
        if (!response.isSuccessful) throw HttpException(response)
        if (response.code() == HTTP_NO_CONTENT) null else response.body()
    }

    override suspend fun setWorkLocation(date: LocalDate, countryCode: String, label: String?): MutationResult<WorkLocationRecord> =
        withAuthorizedUser { token, userId ->
            api.upsertWorkLocation(
                authorization = "Bearer $token",
                userId = userId,
                payload =
                WorkLocationMutationRequest(
                    date = date.toString(),
                    countryCode = countryCode.uppercase(),
                    label = label?.takeIf { it.isNotBlank() }
                )
            )
        }

    override suspend fun loadWeeklyWorkLocations(until: LocalDate): MutationResult<List<WorkLocationRecord>> = withAuthorizedUser { token, userId ->
        api
            .listWorkLocations(
                authorization = "Bearer $token",
                userId = userId,
                startDate = until.minusDays(WEEK_LOOKBACK_DAYS).toString(),
                endDate = until.toString()
            ).items
    }

    override suspend fun deleteLabel(labelId: String): MutationResult<Unit> {
        val token = sessionController.getFreshAccessToken() ?: return MutationResult.LoggedOut
        val userId = currentUserId ?: return MutationResult.Error("Reload your dashboard before making changes")
        return try {
            api.deleteLabel(authorization = "Bearer $token", labelId = labelId, userId = userId)
            MutationResult.Success(Unit)
        } catch (error: HttpException) {
            when (error.code()) {
                HTTP_UNAUTHORIZED -> {
                    sessionController.logout()
                    MutationResult.LoggedOut
                }
                HTTP_CONFLICT -> MutationResult.ValidationError("Label is in use by tasks or templates and cannot be deleted")
                else -> MutationResult.Error("Request failed (${error.code()})")
            }
        } catch (_: IOException) {
            MutationResult.Error("Unable to reach the Worktime backend")
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            MutationResult.Error(error.message ?: "Request failed")
        }
    }

    override suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse> = withAuthorizedUser { token, _ ->
        api.getSyncStatus(authorization = "Bearer $token")
    }

    override fun logout() {
        sessionController.logout()
        currentUserId = null
    }

    private suspend fun <T> withAuthorizedUser(block: suspend (token: String, userId: Int) -> T): MutationResult<T> {
        val token = sessionController.getFreshAccessToken() ?: return MutationResult.LoggedOut
        val userId = currentUserId ?: return MutationResult.Error("Reload your dashboard before making changes")
        return try {
            MutationResult.Success(block(token, userId))
        } catch (error: HttpException) {
            if (error.code() == HTTP_UNAUTHORIZED) {
                sessionController.logout()
                MutationResult.LoggedOut
            } else if (error.code() == HTTP_BAD_REQUEST) {
                MutationResult.ValidationError("Request validation failed")
            } else {
                MutationResult.Error("Request failed (${error.code()})")
            }
        } catch (_: IOException) {
            MutationResult.Error("Unable to reach the Worktime backend")
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            MutationResult.Error(error.message ?: "Request failed")
        }
    }
}
