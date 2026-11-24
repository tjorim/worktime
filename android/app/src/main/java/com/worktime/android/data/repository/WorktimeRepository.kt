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
import kotlinx.serialization.SerializationException
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

    /** The session this load belonged to ended or was replaced mid-flight; its outcome must be ignored. */
    data object Superseded : DashboardLoadResult

    data class Error(val message: String) : DashboardLoadResult
}

/** A dashboard snapshot persisted by [DashboardCache], with the ISO-8601 instant it was cached at. */
data class CachedDashboard(val dashboard: DashboardResponse, val cachedAt: String)

/**
 * Durable on-disk read cache for the dashboard read model (#1230), so a cold launch with no
 * connectivity can render the user's last-known data instead of a bare error. Entries are
 * partitioned by an opaque account/environment key (#2092): [load] only returns what was [save]d
 * for the same key. [clear] is suspend (awaited by every caller) so a subsequent sign-in on a shared
 * device can never observe the previous account's cached dashboard through an unfinished,
 * fire-and-forget deletion.
 */
interface DashboardCache {
    suspend fun load(accountKey: String): CachedDashboard?

    suspend fun save(accountKey: String, dashboard: DashboardResponse, cachedAt: String)

    suspend fun clear()
}

sealed interface MutationResult<out T> {
    data class Success<T>(val value: T) : MutationResult<T>

    data object LoggedOut : MutationResult<Nothing>

    /** The session this request belonged to ended or was replaced mid-flight; its outcome must be ignored. */
    data object Superseded : MutationResult<Nothing>

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

    /** The API environment requests currently go to; state loaded from another one must not be kept. */
    val apiEnvironment: String get() = ""

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
    private val cache: DashboardCache? = null,
    /** The API environment in effect (base URL); part of every request's scope and of the cache key. */
    private val environmentKey: () -> String = { "" }
) : DashboardRepository {
    override val sessionState: StateFlow<SessionState> = sessionController.sessionState
    override val apiEnvironment: String get() = environmentKey()

    companion object {
        private const val HTTP_NO_CONTENT = 204
        private const val HTTP_BAD_REQUEST = 400
        private const val HTTP_UNAUTHORIZED = 401
        private const val HTTP_NOT_FOUND = 404
        private const val HTTP_CONFLICT = 409
        private const val WEEK_LOOKBACK_DAYS = 6L
        private const val HTTP_SERVER_ERROR = 500

        // Actionable copy for transport and decode failures. Never pass an exception's own message
        // through: it is an English diagnostic that can leak internals (#2093).
        private const val OFFLINE_MESSAGE = "Can't reach Worktime. Check your connection and retry."
        private const val UNREADABLE_RESPONSE_MESSAGE =
            "Worktime sent data this app can't read. Retry, or update the app if it keeps happening."
        private const val UNKNOWN_LOAD_MESSAGE = "Something went wrong loading Worktime data. Retry in a moment."
        private const val UNKNOWN_REQUEST_MESSAGE = "Something went wrong. Retry in a moment."
        private const val SERVER_TROUBLE_MESSAGE = "Worktime is having trouble right now. Retry in a moment."
        private const val LABEL_NAME_CONFLICT_MESSAGE = "Label name must be unique"
        private const val LABEL_IN_USE_MESSAGE = "Label is in use by tasks or templates and cannot be deleted"
    }

    override suspend fun loadDashboard(): DashboardLoadResult {
        val scope = currentScope()
        val cacheKey = currentCacheKey()
        return try {
            val token = sessionController.getFreshAccessToken()
            when {
                token == null ->
                    if (sessionEnded(scope)) DashboardLoadResult.LoggedOut else DashboardLoadResult.Superseded
                // The token was issued after a sign-out/sign-in (or an environment change) that
                // happened while this request waited for it: never send it as the old session.
                !isCurrent(scope) -> DashboardLoadResult.Superseded
                else -> fetchDashboard(scope, cacheKey, token)
            }
        } catch (error: HttpException) {
            when {
                !isCurrent(scope) -> DashboardLoadResult.Superseded
                error.code() == HTTP_UNAUTHORIZED -> {
                    endSession()
                    DashboardLoadResult.LoggedOut
                }
                else -> DashboardLoadResult.Error(httpFailureMessage(error.code()))
            }
        } catch (_: IOException) {
            unlessSuperseded(scope, DashboardLoadResult.Superseded) {
                DashboardLoadResult.Error(OFFLINE_MESSAGE)
            }
        } catch (_: SerializationException) {
            unlessSuperseded(scope, DashboardLoadResult.Superseded) {
                DashboardLoadResult.Error(UNREADABLE_RESPONSE_MESSAGE)
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            unlessSuperseded(scope, DashboardLoadResult.Superseded) {
                DashboardLoadResult.Error(UNKNOWN_LOAD_MESSAGE)
            }
        }
    }

    private suspend fun fetchDashboard(scope: RequestScope?, cacheKey: String?, token: String): DashboardLoadResult {
        val dashboard = api.getDashboard(authorization = "Bearer $token", timezone = TimeZone.getDefault().id)
        // A response for a session that has since ended or been replaced must neither be shown
        // nor persisted: it would put the previous account's data on disk after sign-out.
        if (!isCurrent(scope)) return DashboardLoadResult.Superseded
        // Best-effort: a cache-persistence failure must never turn an already-successful
        // fetch into a reported error, so it's isolated from loadDashboard's own try/catch.
        cacheDashboard(cacheKey, dashboard)
        // The cache write suspends; a sign-in during it must not hand this dashboard to the new session.
        if (!isCurrent(scope)) return DashboardLoadResult.Superseded
        return DashboardLoadResult.Success(dashboard)
    }

    private suspend fun cacheDashboard(cacheKey: String?, dashboard: DashboardResponse) {
        if (cacheKey == null) return
        try {
            cache?.save(cacheKey, dashboard, OffsetDateTime.now(ZoneOffset.UTC).toString())
        } catch (error: Exception) {
            if (error is CancellationException) throw error
        }
    }

    override suspend fun loadCachedDashboard(): CachedDashboard? {
        val scope = currentScope()
        val cacheKey = currentCacheKey() ?: return null
        val cached = cache?.load(cacheKey) ?: return null
        return cached.takeIf { isCurrent(scope) }
    }

    /** The session and API environment a request starts in, or null while signed out. */
    private fun currentScope(): RequestScope? {
        val session = sessionController.sessionState.value as? SessionState.Authenticated ?: return null
        return RequestScope(session.sessionId, environmentKey())
    }

    /** Whether [scope] is still the active session and environment, so a response may be applied. */
    private fun isCurrent(scope: RequestScope?): Boolean = currentScope() == scope

    /** [outcome] while [scope] is still current, otherwise [superseded]: a stale failure is not worth reporting. */
    private inline fun <R> unlessSuperseded(scope: RequestScope?, superseded: R, outcome: () -> R): R =
        if (isCurrent(scope)) outcome() else superseded

    /** Key for the persisted dashboard: the principal plus the environment, null when there is no identity. */
    private fun currentCacheKey(): String? {
        val session = sessionController.sessionState.value as? SessionState.Authenticated ?: return null
        return session.accountKey?.let { "${environmentKey()}|$it" }
    }

    /**
     * Handles the session controller reporting no token. Returns true when the session ended (and
     * clears what was cached for it), false when a newer session replaced the one [scope] began in.
     */
    private suspend fun sessionEnded(scope: RequestScope?): Boolean {
        if (sessionController.sessionState.value !is SessionState.Authenticated) {
            clearCacheBestEffort()
            return true
        }
        return isCurrent(scope)
    }

    /** Ends the current session after the backend rejected its credentials, and drops its cached data. */
    private suspend fun endSession() {
        sessionController.logout()
        // Logging out can suspend; if another sign-in took over meanwhile, its cache is not ours to drop.
        if (sessionController.sessionState.value !is SessionState.Authenticated) clearCacheBestEffort()
    }

    private suspend fun clearCacheBestEffort() {
        try {
            cache?.clear()
        } catch (error: Exception) {
            if (error is CancellationException) throw error
        }
    }

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

    override suspend fun deleteWorkLocation(date: LocalDate): MutationResult<Unit> = withAuthorizedToken { token ->
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

    override suspend fun deleteTemplate(templateId: String): MutationResult<Unit> = withAuthorizedToken { token ->
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

    override suspend fun deleteAccount(): MutationResult<Unit> {
        val result = withAuthorizedToken { token -> api.deleteAccount(authorization = "Bearer $token") }
        // After the request, not inside it: signing out changes the session, which would make the
        // request look superseded.
        if (result is MutationResult.Success) endSession()
        return result
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

    private fun httpFailureMessage(code: Int): String =
        if (code >= HTTP_SERVER_ERROR) SERVER_TROUBLE_MESSAGE else "Unable to load Worktime data ($code)"

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
        val scope = currentScope()
        return try {
            val token = sessionController.getFreshAccessToken()
            when {
                token == null ->
                    if (sessionEnded(scope)) MutationResult.LoggedOut else MutationResult.Superseded
                // A token issued after the session changed belongs to the new session: an action
                // started under the old one must not be sent with it.
                !isCurrent(scope) -> MutationResult.Superseded
                else -> {
                    val value = block(token)
                    if (isCurrent(scope)) MutationResult.Success(value) else MutationResult.Superseded
                }
            }
        } catch (error: HttpException) {
            when {
                !isCurrent(scope) -> MutationResult.Superseded
                error.code() == HTTP_UNAUTHORIZED -> {
                    endSession()
                    MutationResult.LoggedOut
                }
                else -> mapHttpError(error, conflictMessage)
            }
        } catch (_: IOException) {
            unlessSuperseded(scope, MutationResult.Superseded) {
                MutationResult.Error(OFFLINE_MESSAGE)
            }
        } catch (_: SerializationException) {
            unlessSuperseded(scope, MutationResult.Superseded) {
                MutationResult.Error(UNREADABLE_RESPONSE_MESSAGE)
            }
        } catch (error: Exception) {
            if (error is CancellationException) throw error
            unlessSuperseded(scope, MutationResult.Superseded) {
                MutationResult.Error(UNKNOWN_REQUEST_MESSAGE)
            }
        }
    }
}

/** What a request started in; a response is only applied while the active session and environment still match. */
private data class RequestScope(val sessionId: Long, val environment: String)

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
