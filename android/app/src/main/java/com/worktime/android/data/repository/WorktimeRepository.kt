package com.worktime.android.data.repository

import android.content.Intent
import com.worktime.android.core.auth.SessionController
import com.worktime.android.core.auth.SessionState
import com.worktime.android.data.api.WorktimeApi
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FcmTokenRequest
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

/** A dashboard snapshot persisted by [DashboardCache], with the ISO-8601 instant it was cached at. */
data class CachedDashboard(val dashboard: DashboardResponse, val cachedAt: String)

/**
 * Durable on-disk read cache for the dashboard read model (#1230), so a cold launch with no
 * connectivity can render the user's last-known data instead of a bare error. [clear] is suspend
 * (awaited by every caller) so a subsequent sign-in on a shared device can never observe the
 * previous account's cached dashboard through an unfinished, fire-and-forget deletion.
 */
interface DashboardCache {
    suspend fun load(): CachedDashboard?

    suspend fun save(dashboard: DashboardResponse, cachedAt: String)

    suspend fun clear()
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

    /**
     * The last dashboard snapshot successfully persisted to [DashboardCache], if any — used to
     * render something meaningful while a fresh [loadDashboard] call is in flight, or instead of
     * a hard error when it fails. Defaults to no cache for repositories that don't back one.
     */
    suspend fun loadCachedDashboard(): CachedDashboard? = null

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

    /** Registers this device's FCM token for background push-wake (#1205). Best-effort. */
    suspend fun registerFcmToken(token: String): MutationResult<Unit>

    /** Unregisters this device's FCM token. Best-effort. */
    suspend fun unregisterFcmToken(token: String): MutationResult<Unit>

    /**
     * Builds the provider end-session intent for an interactive sign-out, without
     * clearing local state. See [SessionController.buildLogoutIntent].
     */
    suspend fun buildLogoutIntent(): Intent?

    /** Clears local session state. Pairs with [buildLogoutIntent] once its flow returns. */
    suspend fun completeLogout()
}

@Suppress("TooManyFunctions") // implements the single-facade DashboardRepository
class WorktimeRepository(
    private val api: WorktimeApi,
    private val sessionController: SessionController,
    private val cache: DashboardCache? = null
) : DashboardRepository {
    override val sessionState: StateFlow<SessionState> = sessionController.sessionState

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
        val timezone = TimeZone.getDefault().id
        return try {
            val token = sessionController.getFreshAccessToken() ?: return DashboardLoadResult.LoggedOut
            val dashboard = api.getDashboard(authorization = "Bearer $token", timezone = timezone)
            // Best-effort: a cache-persistence failure must never turn an already-successful
            // fetch into a reported error, so it's isolated from this function's own try/catch.
            cacheDashboard(dashboard)
            DashboardLoadResult.Success(dashboard)
        } catch (error: HttpException) {
            if (error.code() == HTTP_UNAUTHORIZED) {
                sessionController.logout()
                cache?.clear()
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

    private suspend fun cacheDashboard(dashboard: DashboardResponse) {
        try {
            cache?.save(dashboard, OffsetDateTime.now(ZoneOffset.UTC).toString())
        } catch (error: Exception) {
            if (error is CancellationException) throw error
        }
    }

    override suspend fun loadCachedDashboard(): CachedDashboard? = cache?.load()

    override suspend fun startTimeTracking(text: String, labelId: String?): MutationResult<TaskRecord> {
        val now = OffsetDateTime.now(ZoneOffset.UTC).toString()
        return withAuthorizedToken { token ->
            api.createTask(
                authorization = "Bearer $token",
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
        return withAuthorizedToken { token ->
            api.updateTask(
                authorization = "Bearer $token",
                taskId = taskId,
                payload = TaskMutationRequest(stopTime = now)
            )
        }
    }

    override suspend fun updateTask(taskId: String, text: String?, labelId: String?): MutationResult<TaskRecord> =
        withAuthorizedToken { token ->
            api.updateTask(
                authorization = "Bearer $token",
                taskId = taskId,
                payload = TaskMutationRequest(text = text, labelId = labelId)
            )
        }

    override suspend fun getRunningTask(): MutationResult<TaskRecord?> = withAuthorizedToken { token ->
        val response = api.getRunningTask(authorization = "Bearer $token")
        if (!response.isSuccessful) throw HttpException(response)
        if (response.code() == HTTP_NO_CONTENT) null else response.body()
    }

    override suspend fun listTasks(startDate: LocalDate?, endDate: LocalDate?): MutationResult<List<TaskRecord>> =
        withAuthorizedToken { token ->
            api
                .listTasks(
                    authorization = "Bearer $token",
                    startDate = startDate?.toString(),
                    endDate = endDate?.toString()
                ).items
        }

    override suspend fun deleteTask(taskId: String): MutationResult<Unit> = withAuthorizedToken { token ->
        api.deleteTask(authorization = "Bearer $token", taskId = taskId)
    }

    override suspend fun setWorkLocation(
        date: LocalDate,
        countryCode: String,
        label: String?
    ): MutationResult<WorkLocationRecord> = withAuthorizedToken { token ->
        api.upsertWorkLocation(
            authorization = "Bearer $token",
            valueDate = date.toString(),
            payload =
            WorkLocationMutationRequest(
                countryCode = countryCode.uppercase(),
                label = label?.takeIf { it.isNotBlank() }
            )
        )
    }

    override suspend fun loadWeeklyWorkLocations(until: LocalDate): MutationResult<List<WorkLocationRecord>> =
        withAuthorizedToken { token ->
            api
                .listWorkLocations(
                    authorization = "Bearer $token",
                    startDate = until.minusDays(WEEK_LOOKBACK_DAYS).toString(),
                    endDate = until.toString()
                ).items
        }

    override suspend fun getWorkLocation(date: LocalDate): MutationResult<WorkLocationRecord?> =
        withAuthorizedToken { token ->
            val response = api.getWorkLocation(authorization = "Bearer $token", valueDate = date.toString())
            if (response.code() == HTTP_NOT_FOUND) return@withAuthorizedToken null
            if (!response.isSuccessful) throw HttpException(response)
            response.body()
        }

    override suspend fun deleteWorkLocation(date: LocalDate): MutationResult<Unit> =
        withAuthorizedToken { token ->
            api.deleteWorkLocation(authorization = "Bearer $token", valueDate = date.toString())
        }

    override suspend fun createLabel(name: String, color: String): MutationResult<LabelRecord> =
        withAuthorizedToken(conflictMessage = LABEL_NAME_CONFLICT_MESSAGE) { token ->
            api.createLabel(
                authorization = "Bearer $token",
                payload = LabelMutationRequest(name = name, color = color)
            )
        }

    override suspend fun listLabels(): MutationResult<List<LabelRecord>> = withAuthorizedToken { token ->
        api.listLabels(authorization = "Bearer $token").items
    }

    override suspend fun updateLabel(labelId: String, name: String?, color: String?): MutationResult<LabelRecord> =
        withAuthorizedToken(conflictMessage = LABEL_NAME_CONFLICT_MESSAGE) { token ->
            api.updateLabel(
                authorization = "Bearer $token",
                labelId = labelId,
                payload = LabelPatchRequest(name = name, color = color)
            )
        }

    override suspend fun deleteLabel(labelId: String): MutationResult<Unit> =
        withAuthorizedToken(conflictMessage = LABEL_IN_USE_MESSAGE) { token ->
            api.deleteLabel(authorization = "Bearer $token", labelId = labelId)
        }

    override suspend fun createTemplate(
        text: String,
        labelId: String?,
        startTime: LocalTime,
        stopTime: LocalTime
    ): MutationResult<TemplateRecord> = withAuthorizedToken { token ->
        api.createTemplate(
            authorization = "Bearer $token",
            payload =
            TemplateMutationRequest(
                text = text,
                labelId = labelId,
                startTime = startTime.toString(),
                stopTime = stopTime.toString()
            )
        )
    }

    override suspend fun listTemplates(): MutationResult<List<TemplateRecord>> = withAuthorizedToken { token ->
        api.listTemplates(authorization = "Bearer $token").items
    }

    override suspend fun updateTemplate(
        templateId: String,
        text: String?,
        labelId: String?,
        startTime: LocalTime?,
        stopTime: LocalTime?
    ): MutationResult<TemplateRecord> = withAuthorizedToken { token ->
        api.updateTemplate(
            authorization = "Bearer $token",
            templateId = templateId,
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
        withAuthorizedToken { token ->
            api.deleteTemplate(authorization = "Bearer $token", templateId = templateId)
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

    override suspend fun loadSyncStatus(): MutationResult<SyncStatusResponse> = withAuthorizedToken { token ->
        api.getSyncStatus(authorization = "Bearer $token")
    }

    override suspend fun loadWorkLocationPreferences(): MutationResult<WorkLocationPreferences> =
        withAuthorizedToken { token ->
            getPreferencesData(token).toWorkLocationPreferences()
        }

    override suspend fun updateWorkLocationPreferences(
        homeCountry: String?,
        officeCountry: String?
    ): MutationResult<WorkLocationPreferences> = withAuthorizedToken { token ->
        val existing = getPreferencesData(token) ?: JsonObject(emptyMap())
        val updated = existing.withWorkLocationPreferences(homeCountry, officeCountry)
        api.putPreferences(
            authorization = "Bearer $token",
            payload =
            UserPreferencesWrite(
                data = updated,
                clientUpdatedAt = OffsetDateTime.now(ZoneOffset.UTC).toString()
            )
        )
        updated.toWorkLocationPreferences()
    }

    private suspend fun getPreferencesData(token: String): JsonObject? {
        val response = api.getPreferences(authorization = "Bearer $token")
        if (!response.isSuccessful) throw HttpException(response)
        return response.body()?.data
    }

    override suspend fun deleteAccount(): MutationResult<Unit> = withAuthorizedToken { token ->
        api.deleteAccount(authorization = "Bearer $token")
        sessionController.logout()
        cache?.clear()
    }

    override suspend fun registerFcmToken(token: String): MutationResult<Unit> = withAuthorizedToken<Unit> {
        api.registerFcmToken(authorization = "Bearer $it", payload = FcmTokenRequest(token))
    }

    override suspend fun unregisterFcmToken(token: String): MutationResult<Unit> = withAuthorizedToken {
        api.unregisterFcmToken(authorization = "Bearer $it", token = token)
    }

    override suspend fun buildLogoutIntent(): Intent? = sessionController.buildLogoutIntent()

    override suspend fun completeLogout() {
        sessionController.completeLogout()
        cache?.clear()
    }

    private fun mapHttpError(error: HttpException, conflictMessage: String? = null): MutationResult<Nothing> =
        when (error.code()) {
            HTTP_BAD_REQUEST -> MutationResult.ValidationError("Request validation failed")
            HTTP_CONFLICT -> MutationResult.ValidationError(conflictMessage ?: "Request conflicts with existing data")
            else -> MutationResult.Error("Request failed (${error.code()})")
        }

    private suspend fun <T> withAuthorizedToken(
        conflictMessage: String? = null,
        block: suspend (token: String) -> T
    ): MutationResult<T> {
        return try {
            val token = sessionController.getFreshAccessToken() ?: return MutationResult.LoggedOut
            MutationResult.Success(block(token))
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
