package com.worktime.android.data.repository

import com.worktime.android.core.auth.SessionController
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.LabelMutationRequest
import com.worktime.android.data.model.LabelPatchRequest
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TemplateMutationRequest
import com.worktime.android.data.model.TemplatePatchRequest
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.data.model.TimeOffEntryMutationRequest
import com.worktime.android.data.model.TimeOffEntryPatchRequest
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.model.UserPreferencesWrite
import com.worktime.android.data.model.WorkLocationMutationRequest
import com.worktime.android.data.model.WorkLocationRecord
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.TimeZone
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
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

data class WorkLocationPreferences(val homeCountry: String? = null, val officeCountry: String? = null)

/** Domain shape for creating/editing a time-off entry, mirroring the backend's discriminated `entry_kind`. */
sealed interface TimeOffDraft {
    val entryType: String
    val entryFlag: String
    val note: String?

    data class SingleDate(
        val date: LocalDate,
        override val entryType: String,
        override val entryFlag: String,
        override val note: String? = null
    ) : TimeOffDraft

    data class DateRange(
        val startDate: LocalDate,
        val endDate: LocalDate,
        override val entryType: String,
        override val entryFlag: String,
        override val note: String? = null
    ) : TimeOffDraft

    data class Weekly(
        val weekday: Int,
        override val entryType: String,
        override val entryFlag: String,
        override val note: String? = null
    ) : TimeOffDraft
}

@Suppress("TooManyFunctions") // one cohesive repository facade over the whole backend surface
interface DashboardRepository {
    val sessionState: StateFlow<SessionState>

    suspend fun loadDashboard(): DashboardLoadResult

    suspend fun startTimeTracking(text: String, labelId: String? = null): MutationResult<TaskRecord>

    suspend fun stopTimeTracking(taskId: String): MutationResult<TaskRecord>

    suspend fun updateTask(taskId: String, text: String? = null, labelId: String? = null): MutationResult<TaskRecord>

    suspend fun getRunningTask(): MutationResult<TaskRecord?>

    suspend fun listTasks(startDate: LocalDate? = null, endDate: LocalDate? = null): MutationResult<List<TaskRecord>>

    suspend fun deleteTask(taskId: String): MutationResult<Unit>

    suspend fun setWorkLocation(
        date: LocalDate,
        countryCode: String,
        label: String? = null
    ): MutationResult<WorkLocationRecord>

    suspend fun loadWeeklyWorkLocations(until: LocalDate = LocalDate.now()): MutationResult<List<WorkLocationRecord>>

    suspend fun getWorkLocation(date: LocalDate): MutationResult<WorkLocationRecord?>

    suspend fun deleteWorkLocation(date: LocalDate): MutationResult<Unit>

    suspend fun createLabel(name: String, color: String): MutationResult<LabelRecord>

    suspend fun listLabels(): MutationResult<List<LabelRecord>>

    suspend fun updateLabel(labelId: String, name: String? = null, color: String? = null): MutationResult<LabelRecord>

    suspend fun deleteLabel(labelId: String): MutationResult<Unit>

    suspend fun createTemplate(
        text: String,
        labelId: String?,
        startTime: LocalTime,
        stopTime: LocalTime
    ): MutationResult<TemplateRecord>

    suspend fun listTemplates(): MutationResult<List<TemplateRecord>>

    suspend fun updateTemplate(
        templateId: String,
        text: String? = null,
        labelId: String? = null,
        startTime: LocalTime? = null,
        stopTime: LocalTime? = null
    ): MutationResult<TemplateRecord>

    suspend fun deleteTemplate(templateId: String): MutationResult<Unit>

    suspend fun createTimeOffEntry(draft: TimeOffDraft): MutationResult<TimeOffEntryRecord>

    suspend fun listTimeOffEntries(
        startDate: LocalDate? = null,
        endDate: LocalDate? = null
    ): MutationResult<List<TimeOffEntryRecord>>

    suspend fun getTimeOffEntry(entryId: String): MutationResult<TimeOffEntryRecord>

    suspend fun updateTimeOffEntry(entryId: String, draft: TimeOffDraft): MutationResult<TimeOffEntryRecord>

    suspend fun deleteTimeOffEntry(entryId: String): MutationResult<Unit>

    suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse>

    suspend fun loadWorkLocationPreferences(): MutationResult<WorkLocationPreferences>

    suspend fun updateWorkLocationPreferences(
        homeCountry: String?,
        officeCountry: String?
    ): MutationResult<WorkLocationPreferences>

    suspend fun deleteAccount(): MutationResult<Unit>

    suspend fun logout()
}

@Suppress("TooManyFunctions") // implements the single-facade DashboardRepository
class WorktimeRepository(private val api: WorktimeApi, private val sessionController: SessionController) :
    DashboardRepository {
    override val sessionState: StateFlow<SessionState> = sessionController.sessionState
    private var currentUserId: Int? = null

    companion object {
        private const val HTTP_NO_CONTENT = 204
        private const val HTTP_BAD_REQUEST = 400
        private const val HTTP_UNAUTHORIZED = 401
        private const val HTTP_NOT_FOUND = 404
        private const val HTTP_CONFLICT = 409
        private const val WEEK_LOOKBACK_DAYS = 6L
        private const val LABEL_NAME_CONFLICT_MESSAGE = "Label name must be unique"
        private const val LABEL_IN_USE_MESSAGE = "Label is in use by tasks or templates and cannot be deleted"
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

    override suspend fun updateTask(taskId: String, text: String?, labelId: String?): MutationResult<TaskRecord> =
        withAuthorizedUser {
                token,
                userId
            ->
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

    override suspend fun listTasks(startDate: LocalDate?, endDate: LocalDate?): MutationResult<List<TaskRecord>> =
        withAuthorizedUser { token, userId ->
            api
                .listTasks(
                    authorization = "Bearer $token",
                    userId = userId,
                    startDate = startDate?.toString(),
                    endDate = endDate?.toString()
                ).items
        }

    override suspend fun deleteTask(taskId: String): MutationResult<Unit> = withAuthorizedUser { token, userId ->
        api.deleteTask(authorization = "Bearer $token", taskId = taskId, userId = userId)
    }

    override suspend fun setWorkLocation(
        date: LocalDate,
        countryCode: String,
        label: String?
    ): MutationResult<WorkLocationRecord> = withAuthorizedUser { token, userId ->
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

    override suspend fun loadWeeklyWorkLocations(until: LocalDate): MutationResult<List<WorkLocationRecord>> =
        withAuthorizedUser {
                token,
                userId
            ->
            api
                .listWorkLocations(
                    authorization = "Bearer $token",
                    userId = userId,
                    startDate = until.minusDays(WEEK_LOOKBACK_DAYS).toString(),
                    endDate = until.toString()
                ).items
        }

    override suspend fun getWorkLocation(date: LocalDate): MutationResult<WorkLocationRecord?> {
        val token = sessionController.getFreshAccessToken() ?: return MutationResult.LoggedOut
        val userId = currentUserId ?: return MutationResult.Error("Reload your dashboard before making changes")
        return try {
            val response =
                api.getWorkLocation(authorization = "Bearer $token", valueDate = date.toString(), userId = userId)
            if (response.code() == HTTP_NOT_FOUND) {
                MutationResult.Success(null)
            } else if (!response.isSuccessful) {
                throw HttpException(response)
            } else {
                MutationResult.Success(response.body())
            }
        } catch (error: HttpException) {
            if (error.code() == HTTP_UNAUTHORIZED) {
                sessionController.logout()
                MutationResult.LoggedOut
            } else {
                mapHttpError(error)
            }
        } catch (_: IOException) {
            MutationResult.Error("Unable to reach the Worktime backend")
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            MutationResult.Error(error.message ?: "Request failed")
        }
    }

    override suspend fun deleteWorkLocation(date: LocalDate): MutationResult<Unit> =
        withAuthorizedUser { token, userId ->
            api.deleteWorkLocation(authorization = "Bearer $token", valueDate = date.toString(), userId = userId)
        }

    override suspend fun createLabel(name: String, color: String): MutationResult<LabelRecord> =
        withAuthorizedUser(conflictMessage = LABEL_NAME_CONFLICT_MESSAGE) { token, userId ->
            api.createLabel(
                authorization = "Bearer $token",
                userId = userId,
                payload = LabelMutationRequest(name = name, color = color)
            )
        }

    override suspend fun listLabels(): MutationResult<List<LabelRecord>> = withAuthorizedUser { token, userId ->
        api.listLabels(authorization = "Bearer $token", userId = userId).items
    }

    override suspend fun updateLabel(labelId: String, name: String?, color: String?): MutationResult<LabelRecord> =
        withAuthorizedUser(conflictMessage = LABEL_NAME_CONFLICT_MESSAGE) { token, userId ->
            api.updateLabel(
                authorization = "Bearer $token",
                labelId = labelId,
                userId = userId,
                payload = LabelPatchRequest(name = name, color = color)
            )
        }

    override suspend fun deleteLabel(labelId: String): MutationResult<Unit> =
        withAuthorizedUser(conflictMessage = LABEL_IN_USE_MESSAGE) { token, userId ->
            api.deleteLabel(authorization = "Bearer $token", labelId = labelId, userId = userId)
        }

    override suspend fun createTemplate(
        text: String,
        labelId: String?,
        startTime: LocalTime,
        stopTime: LocalTime
    ): MutationResult<TemplateRecord> = withAuthorizedUser { token, userId ->
        api.createTemplate(
            authorization = "Bearer $token",
            userId = userId,
            payload =
            TemplateMutationRequest(
                text = text,
                labelId = labelId,
                startTime = startTime.toString(),
                stopTime = stopTime.toString()
            )
        )
    }

    override suspend fun listTemplates(): MutationResult<List<TemplateRecord>> = withAuthorizedUser { token, userId ->
        api.listTemplates(authorization = "Bearer $token", userId = userId).items
    }

    override suspend fun updateTemplate(
        templateId: String,
        text: String?,
        labelId: String?,
        startTime: LocalTime?,
        stopTime: LocalTime?
    ): MutationResult<TemplateRecord> = withAuthorizedUser { token, userId ->
        api.updateTemplate(
            authorization = "Bearer $token",
            templateId = templateId,
            userId = userId,
            payload =
            TemplatePatchRequest(
                text = text,
                labelId = labelId,
                startTime = startTime?.toString(),
                stopTime = stopTime?.toString()
            )
        )
    }

    override suspend fun deleteTemplate(templateId: String): MutationResult<Unit> =
        withAuthorizedUser { token, userId ->
            api.deleteTemplate(authorization = "Bearer $token", templateId = templateId, userId = userId)
        }

    override suspend fun createTimeOffEntry(draft: TimeOffDraft): MutationResult<TimeOffEntryRecord> =
        withAuthorizedToken { token ->
            val response =
                api.upsertTimeOffEntry(authorization = "Bearer $token", payload = draft.toMutationRequest())
            if (!response.isSuccessful) throw HttpException(response)
            response.body() ?: error("Empty response body for time-off entry")
        }

    override suspend fun listTimeOffEntries(
        startDate: LocalDate?,
        endDate: LocalDate?
    ): MutationResult<List<TimeOffEntryRecord>> = withAuthorizedToken { token ->
        api
            .listTimeOffEntries(
                authorization = "Bearer $token",
                startDate = startDate?.toString(),
                endDate = endDate?.toString()
            ).items
    }

    override suspend fun getTimeOffEntry(entryId: String): MutationResult<TimeOffEntryRecord> =
        withAuthorizedToken { token ->
            api.getTimeOffEntry(authorization = "Bearer $token", entryId = entryId)
        }

    override suspend fun updateTimeOffEntry(entryId: String, draft: TimeOffDraft): MutationResult<TimeOffEntryRecord> =
        withAuthorizedToken { token ->
            api.updateTimeOffEntry(
                authorization = "Bearer $token",
                entryId = entryId,
                payload = draft.toPatchRequest()
            )
        }

    override suspend fun deleteTimeOffEntry(entryId: String): MutationResult<Unit> = withAuthorizedToken { token ->
        api.deleteTimeOffEntry(authorization = "Bearer $token", entryId = entryId)
    }

    override suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse> = withAuthorizedUser { token, _ ->
        api.getSyncStatus(authorization = "Bearer $token")
    }

    override suspend fun loadWorkLocationPreferences(): MutationResult<WorkLocationPreferences> =
        withAuthorizedToken { token ->
            api.getPreferences(authorization = "Bearer $token")?.data.toWorkLocationPreferences()
        }

    override suspend fun updateWorkLocationPreferences(
        homeCountry: String?,
        officeCountry: String?
    ): MutationResult<WorkLocationPreferences> = withAuthorizedToken { token ->
        val existing = api.getPreferences(authorization = "Bearer $token")?.data ?: JsonObject(emptyMap())
        val updated = existing.withWorkLocationPreferences(homeCountry, officeCountry)
        api.putPreferences(authorization = "Bearer $token", payload = UserPreferencesWrite(data = updated))
        updated.toWorkLocationPreferences()
    }

    override suspend fun deleteAccount(): MutationResult<Unit> = withAuthorizedToken { token ->
        api.deleteAccount(authorization = "Bearer $token")
        sessionController.logout()
        currentUserId = null
    }

    override suspend fun logout() {
        sessionController.logout()
        currentUserId = null
    }

    private fun mapHttpError(error: HttpException, conflictMessage: String? = null): MutationResult<Nothing> =
        when (error.code()) {
            HTTP_BAD_REQUEST -> MutationResult.ValidationError("Request validation failed")
            HTTP_CONFLICT -> MutationResult.ValidationError(conflictMessage ?: "Request conflicts with existing data")
            else -> MutationResult.Error("Request failed (${error.code()})")
        }

    private suspend fun <T> withAuthorizedUser(
        conflictMessage: String? = null,
        block: suspend (token: String, userId: Int) -> T
    ): MutationResult<T> {
        val token = sessionController.getFreshAccessToken() ?: return MutationResult.LoggedOut
        val userId = currentUserId ?: return MutationResult.Error("Reload your dashboard before making changes")
        return try {
            MutationResult.Success(block(token, userId))
        } catch (error: HttpException) {
            if (error.code() == HTTP_UNAUTHORIZED) {
                sessionController.logout()
                MutationResult.LoggedOut
            } else {
                mapHttpError(error, conflictMessage)
            }
        } catch (_: IOException) {
            MutationResult.Error("Unable to reach the Worktime backend")
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            MutationResult.Error(error.message ?: "Request failed")
        }
    }

    private suspend fun <T> withAuthorizedToken(block: suspend (token: String) -> T): MutationResult<T> {
        val token = sessionController.getFreshAccessToken() ?: return MutationResult.LoggedOut
        return try {
            MutationResult.Success(block(token))
        } catch (error: HttpException) {
            if (error.code() == HTTP_UNAUTHORIZED) {
                sessionController.logout()
                MutationResult.LoggedOut
            } else {
                mapHttpError(error)
            }
        } catch (_: IOException) {
            MutationResult.Error("Unable to reach the Worktime backend")
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            MutationResult.Error(error.message ?: "Request failed")
        }
    }
}

private fun TimeOffDraft.toMutationRequest(): TimeOffEntryMutationRequest = when (this) {
    is TimeOffDraft.SingleDate ->
        TimeOffEntryMutationRequest(
            entryKind = "date",
            date = date.toString(),
            entryType = entryType,
            entryFlag = entryFlag,
            note = note
        )
    is TimeOffDraft.DateRange ->
        TimeOffEntryMutationRequest(
            entryKind = "range",
            startDate = startDate.toString(),
            endDate = endDate.toString(),
            entryType = entryType,
            entryFlag = entryFlag,
            note = note
        )
    is TimeOffDraft.Weekly ->
        TimeOffEntryMutationRequest(
            entryKind = "weekly",
            weekday = weekday,
            entryType = entryType,
            entryFlag = entryFlag,
            note = note
        )
}

private fun TimeOffDraft.toPatchRequest(): TimeOffEntryPatchRequest = when (this) {
    is TimeOffDraft.SingleDate ->
        TimeOffEntryPatchRequest(
            entryKind = "date",
            date = date.toString(),
            entryType = entryType,
            entryFlag = entryFlag,
            note = note.toPatchNote()
        )
    is TimeOffDraft.DateRange ->
        TimeOffEntryPatchRequest(
            entryKind = "range",
            startDate = startDate.toString(),
            endDate = endDate.toString(),
            entryType = entryType,
            entryFlag = entryFlag,
            note = note.toPatchNote()
        )
    is TimeOffDraft.Weekly ->
        TimeOffEntryPatchRequest(
            entryKind = "weekly",
            weekday = weekday,
            entryType = entryType,
            entryFlag = entryFlag,
            note = note.toPatchNote()
        )
}

private fun String?.toPatchNote() = this?.let(::JsonPrimitive) ?: JsonNull

private fun JsonObject?.toWorkLocationPreferences(): WorkLocationPreferences {
    val settings = this?.get("settings")?.asJsonObjectOrNull()
    return WorkLocationPreferences(
        homeCountry = settings?.get("homeCountry")?.asStringOrNull()?.normalizeCountryCode(),
        officeCountry = settings?.get("officeCountry")?.asStringOrNull()?.normalizeCountryCode()
    )
}

private fun JsonObject.withWorkLocationPreferences(homeCountry: String?, officeCountry: String?): JsonObject {
    val settings = this["settings"]?.asJsonObjectOrNull() ?: JsonObject(emptyMap())
    val updatedSettings =
        JsonObject(
            settings
                .toMutableMap()
                .apply {
                    put("homeCountry", homeCountry.toCountryJson())
                    put("officeCountry", officeCountry.toCountryJson())
                }
        )
    return JsonObject(toMutableMap().apply { put("settings", updatedSettings) })
}

private fun JsonElement.asJsonObjectOrNull(): JsonObject? = runCatching { jsonObject }.getOrNull()

private fun JsonElement.asStringOrNull(): String? = runCatching { jsonPrimitive.contentOrNull }.getOrNull()

private fun String?.toCountryJson(): JsonElement = normalizeCountryCode()?.let(::JsonPrimitive) ?: JsonNull

private fun String?.normalizeCountryCode(): String? = this?.trim()?.uppercase()?.takeIf { it.length == 2 }
