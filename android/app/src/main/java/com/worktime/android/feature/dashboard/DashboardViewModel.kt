package com.worktime.android.feature.dashboard

import android.content.Intent
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.worktime.android.core.auth.SessionState
import com.worktime.android.core.auth.activeSessionId
import com.worktime.android.core.network.ConnectivityObserver
import com.worktime.android.core.notifications.fetchPlannedTask
import com.worktime.android.core.sync.SyncSignalTransport
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TemplateRecord
import com.worktime.android.data.model.WorkLocationRecord
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import com.worktime.android.data.repository.WorkLocationPreferences
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.launch

sealed interface DashboardUiState {
    data object Loading : DashboardUiState

    data object LoggedOut : DashboardUiState

    data class Error(val message: String) : DashboardUiState

    /**
     * [staleAsOf] is null for a freshly-fetched dashboard, and set to the ISO-8601 instant it was
     * cached at when this is a cached snapshot shown while offline or before a fresh fetch has
     * completed (#1230) — [com.worktime.android.ui.components.ReadModelScreen] renders it as a
     * banner instead of a hard error or an indefinite loading spinner.
     */
    data class Success(val dashboard: DashboardResponse, val staleAsOf: String? = null) : DashboardUiState
}

data class MobileActionsUiState(
    val runningTask: TaskRecord? = null,
    /** The soonest-starting planned task (stop_time already set, start_time still ahead), if any. */
    val plannedTask: TaskRecord? = null,
    val weeklyWorkLocations: List<WorkLocationRecord> = emptyList(),
    val labels: List<LabelRecord> = emptyList(),
    val templates: List<TemplateRecord> = emptyList(),
    val workLocationPreferences: WorkLocationPreferences = WorkLocationPreferences(),
    val syncStatus: SyncStatusResponse? = null,
    val isSubmitting: Boolean = false,
    val message: String? = null,
    val isDeletingAccount: Boolean = false,
    val deleteAccountError: String? = null
)

@Suppress("TooManyFunctions") // one view model facade for all mobile dashboard actions
class DashboardViewModel(
    private val repository: DashboardRepository,
    connectivityObserver: ConnectivityObserver = ConnectivityObserver.Disabled,
    private val syncSignalTransport: SyncSignalTransport? = null
) : ViewModel() {
    private val _uiState = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()
    private val _actionsState = MutableStateFlow(MobileActionsUiState())
    val actionsState: StateFlow<MobileActionsUiState> = _actionsState.asStateFlow()
    private val _logoutIntent = MutableSharedFlow<Intent>(extraBufferCapacity = 1)

    // Live-updates (#1201): only held while the UI is on screen *and* the user is signed in --
    // no background service, no wake locks. Starts false so a freshly-created view model doesn't
    // open a connection before the composable that owns its lifecycle has actually reported
    // ON_START via onAppForegrounded().
    private val isAppForegrounded = MutableStateFlow(false)

    /** Emits the provider end-session intent for the UI to launch via an activity result launcher. */
    val logoutIntent: SharedFlow<Intent> = _logoutIntent.asSharedFlow()

    // Both jobs use a cancel-and-replace (latest-wins) pattern so overlapping triggers -- pull to
    // refresh, post-mutation submitMutation(), app-open, and now the connectivity reconcile below
    // -- coalesce into one in-flight request per kind instead of racing independent network calls
    // that write _uiState/_actionsState in whatever order their responses happen to land (#1235).
    private var refreshJob: Job? = null
    private var actionsJob: Job? = null

    // The session everything this view model holds belongs to (#2092). When it changes -- sign-out,
    // a forced expiry, another account -- all of it is dropped, and a response that began under an
    // earlier session is ignored (see isActive) instead of landing in the new session's state.
    private var activeSessionId: Long? = repository.sessionState.value.activeSessionId

    init {
        viewModelScope.launch { repository.sessionState.collect(::onSessionState) }
        refresh()
        viewModelScope.launch {
            connectivityObserver.isOnline
                // The first emission is the observer reporting current status, not a reconnect --
                // refresh() above already covers cold start. Only react to genuine transitions.
                .drop(1)
                .collect { online -> if (online) refresh() }
        }
        if (syncSignalTransport != null) {
            viewModelScope.launch {
                isAppForegrounded
                    .combine(repository.sessionState) { foregrounded, sessionState ->
                        if (foregrounded) sessionState.activeSessionId else null
                    }.distinctUntilChanged()
                    // collectLatest: whenever "should be connected" flips (foreground/background,
                    // sign-in/out, a different session), the previous block's `finally` unsubscribes
                    // before a new one (re)subscribes -- never two overlapping SSE connections for
                    // one view model, and never a stream opened for a previous account.
                    .collectLatest { sessionId ->
                        if (sessionId == null) return@collectLatest
                        val unsubscribe = syncSignalTransport.subscribe(::onSyncSignal)
                        try {
                            awaitCancellation()
                        } finally {
                            unsubscribe()
                        }
                    }
            }
        }
    }

    private fun onSessionState(sessionState: SessionState) {
        val sessionId = sessionState.activeSessionId
        if (sessionId != activeSessionId) {
            activeSessionId = sessionId
            refreshJob?.cancel()
            actionsJob?.cancel()
            _actionsState.value = MobileActionsUiState()
            _uiState.value = DashboardUiState.Loading
            if (sessionId != null) refresh()
        }
        if (sessionState is SessionState.LoggedOut) {
            _uiState.value = DashboardUiState.LoggedOut
        }
    }

    /** Whether [sessionId] is still the signed-in session, i.e. a result obtained under it may be applied. */
    private fun isActive(sessionId: Long?): Boolean = repository.sessionState.value.activeSessionId == sessionId

    /** The UI reporting `ON_START`: (re)connects the live-updates stream if signed in. */
    fun onAppForegrounded() {
        isAppForegrounded.value = true
    }

    /** The UI reporting `ON_STOP`: drops the live-updates connection -- no background wake. */
    fun onAppBackgrounded() {
        isAppForegrounded.value = false
    }

    /**
     * Handles a `sync_changed` signal (#1201): mirrors `useSyncSignal`'s dedup -- skips the pull
     * when the last-known sync cursor ([MobileActionsUiState.syncStatus]) is already at or ahead
     * of the signal, since notify-then-pull signals only carry a freshness hint.
     *
     * [SyncSignalTransport.FORCE_REFRESH_SIGNAL] bypasses this comparison entirely and always
     * refreshes -- a reconnect catch-up has no real timestamp to compare (there's nothing to
     * vouch for what, if anything, was missed), and comparing the device's local clock against a
     * cursor recorded from the server's clock would let clock skew silently drop the catch-up.
     */
    private fun onSyncSignal(serverTimestamp: String) {
        viewModelScope.launch {
            if (serverTimestamp != SyncSignalTransport.FORCE_REFRESH_SIGNAL) {
                val signalInstant = parseInstantOrNull(serverTimestamp) ?: return@launch
                val cursorInstant = _actionsState.value.syncStatus?.serverTimestamp?.let(::parseInstantOrNull)
                if (cursorInstant != null && !cursorInstant.isBefore(signalInstant)) return@launch
            }
            refresh()
        }
    }

    fun refresh() {
        refreshJob?.cancel()
        val sessionId = repository.sessionState.value.activeSessionId
        refreshJob =
            viewModelScope.launch {
                // Cold start (or recovering from LoggedOut/Error): show the last cached dashboard
                // immediately, marked stale, rather than blocking on the network round trip below.
                // Skipped once a Success is already showing so an in-place refresh doesn't flicker
                // back to a possibly-older cached snapshot.
                if (_uiState.value !is DashboardUiState.Success) {
                    val cached = repository.loadCachedDashboard()
                    if (!isActive(sessionId)) return@launch
                    _uiState.value =
                        if (cached != null) {
                            DashboardUiState.Success(cached.dashboard, staleAsOf = cached.cachedAt)
                        } else {
                            DashboardUiState.Loading
                        }
                }
                val result = repository.loadDashboard()
                if (!isActive(sessionId)) return@launch
                when (result) {
                    is DashboardLoadResult.Success -> {
                        refreshActions()
                        _uiState.value = DashboardUiState.Success(result.dashboard)
                    }
                    DashboardLoadResult.LoggedOut -> _uiState.value = DashboardUiState.LoggedOut
                    // The session or API environment changed under this request; a refresh for the
                    // new one is already on its way (or is the caller's to start).
                    DashboardLoadResult.Superseded -> Unit
                    is DashboardLoadResult.Error -> {
                        // A cached (possibly stale) dashboard is still more useful than a hard
                        // error, so only surface the error when there is nothing to show instead.
                        if (_uiState.value !is DashboardUiState.Success) {
                            _uiState.value = DashboardUiState.Error(result.message)
                        }
                    }
                }
            }
    }

    fun refreshActions() {
        actionsJob?.cancel()
        actionsJob =
            viewModelScope.launch {
                refreshActionsNow()
            }
    }

    private suspend fun refreshActionsNow() = coroutineScope {
        val sessionId = repository.sessionState.value.activeSessionId
        val runningTaskAsync = async { repository.getRunningTask().valueOrNull() }
        val plannedTaskAsync = async { fetchPlannedTask(repository) }
        val weeklyLocationsAsync = async { repository.loadWeeklyWorkLocations().valueOrNull().orEmpty() }
        val syncStatusAsync = async { repository.loadSyncStatus().valueOrNull() }
        val workLocationPreferencesAsync =
            async { repository.loadWorkLocationPreferences().valueOrNull() ?: WorkLocationPreferences() }
        val labelsAsync = async { repository.listLabels().valueOrNull().orEmpty() }
        val templatesAsync = async { repository.listTemplates().valueOrNull().orEmpty() }
        val runningTask = runningTaskAsync.await()
        val plannedTask = plannedTaskAsync.await()
        val weeklyWorkLocations = weeklyLocationsAsync.await()
        val syncStatus = syncStatusAsync.await()
        val workLocationPreferences = workLocationPreferencesAsync.await()
        val labels = labelsAsync.await()
        val templates = templatesAsync.await()
        if (!isActive(sessionId)) return@coroutineScope
        _actionsState.value =
            _actionsState.value.copy(
                runningTask = runningTask,
                plannedTask = plannedTask,
                weeklyWorkLocations = weeklyWorkLocations,
                syncStatus = syncStatus,
                workLocationPreferences = workLocationPreferences,
                labels = labels,
                templates = templates
            )
    }

    fun startTimeTracking(text: String, labelId: String? = null) {
        submitMutation { repository.startTimeTracking(text, labelId) }
    }

    fun stopTimeTracking(taskId: String) {
        submitMutation { repository.stopTimeTracking(taskId) }
    }

    fun updateTask(taskId: String, text: String?, labelId: String?) {
        submitMutation { repository.updateTask(taskId = taskId, text = text, labelId = labelId) }
    }

    fun setWorkLocation(date: LocalDate, countryCode: String, label: String?) {
        submitMutation { repository.setWorkLocation(date = date, countryCode = countryCode, label = label) }
    }

    fun deleteWorkLocation(date: LocalDate) {
        submitMutation { repository.deleteWorkLocation(date) }
    }

    fun updateWorkLocationPreferences(homeCountry: String?, officeCountry: String?) {
        submitMutation { repository.updateWorkLocationPreferences(homeCountry, officeCountry) }
    }

    fun createLabel(name: String, color: String) {
        submitMutation { repository.createLabel(name, color) }
    }

    fun updateLabel(labelId: String, name: String, color: String) {
        submitMutation { repository.updateLabel(labelId = labelId, name = name, color = color) }
    }

    fun deleteLabel(labelId: String) {
        submitMutation { repository.deleteLabel(labelId) }
    }

    fun createTemplate(text: String, labelId: String?, startTime: java.time.LocalTime, stopTime: java.time.LocalTime) {
        submitMutation {
            repository.createTemplate(
                text = text,
                labelId = labelId,
                startTime = startTime,
                stopTime = stopTime
            )
        }
    }

    fun updateTemplate(
        templateId: String,
        text: String,
        labelId: String?,
        startTime: java.time.LocalTime,
        stopTime: java.time.LocalTime
    ) {
        submitMutation {
            repository.updateTemplate(
                templateId = templateId,
                text = text,
                labelId = labelId,
                startTime = startTime,
                stopTime = stopTime
            )
        }
    }

    fun deleteTemplate(templateId: String) {
        submitMutation { repository.deleteTemplate(templateId) }
    }

    /**
     * Starts an interactive sign-out. If there is a provider session to end, this only emits
     * [logoutIntent] for the UI to launch and waits for [onLogoutFlowFinished] before clearing
     * local state — clearing it here (before the browser round trip even started) would report
     * signed-out while the provider session is still alive, and the next sign-in would then
     * silently succeed via SSO with no credential prompt. When there is nothing to end at the
     * provider, it completes immediately.
     */
    fun logout() {
        viewModelScope.launch {
            val intent =
                runCatching { repository.buildLogoutIntent() }
                    .onFailure { if (it is CancellationException) throw it }
                    .getOrNull()
            if (intent != null) {
                _logoutIntent.emit(intent)
            } else {
                completeLogout()
            }
        }
    }

    /** Called once the launched end-session activity returns control to the app, whatever the outcome. */
    fun onLogoutFlowFinished() {
        viewModelScope.launch { completeLogout() }
    }

    private suspend fun completeLogout() {
        repository.completeLogout()
        _uiState.value = DashboardUiState.LoggedOut
    }

    fun deleteAccount() {
        val sessionId = repository.sessionState.value.activeSessionId
        viewModelScope.launch {
            _actionsState.value = _actionsState.value.copy(isDeletingAccount = true, deleteAccountError = null)
            val result = repository.deleteAccount()
            if (!isActive(sessionId)) return@launch
            when (result) {
                is MutationResult.Success -> {
                    _uiState.value = DashboardUiState.LoggedOut
                    _actionsState.value = _actionsState.value.copy(isDeletingAccount = false)
                }
                MutationResult.LoggedOut -> {
                    _uiState.value = DashboardUiState.LoggedOut
                    _actionsState.value = _actionsState.value.copy(isDeletingAccount = false)
                }
                MutationResult.Superseded -> {
                    _actionsState.value = _actionsState.value.copy(isDeletingAccount = false)
                }
                is MutationResult.ValidationError -> {
                    _actionsState.value =
                        _actionsState.value.copy(isDeletingAccount = false, deleteAccountError = result.message)
                }
                is MutationResult.Error -> {
                    _actionsState.value =
                        _actionsState.value.copy(isDeletingAccount = false, deleteAccountError = result.message)
                }
            }
        }
    }

    private fun submitMutation(block: suspend () -> MutationResult<*>) {
        val sessionId = repository.sessionState.value.activeSessionId
        viewModelScope.launch {
            _actionsState.value = _actionsState.value.copy(isSubmitting = true, message = null)
            val result = block()
            if (!isActive(sessionId)) return@launch
            _actionsState.value =
                when (result) {
                    is MutationResult.Success -> {
                        refreshActions()
                        _actionsState.value.copy(isSubmitting = false, message = "Saved")
                    }
                    MutationResult.LoggedOut -> {
                        _uiState.value = DashboardUiState.LoggedOut
                        _actionsState.value.copy(isSubmitting = false, message = "Session expired. Sign in again.")
                    }
                    MutationResult.Superseded -> _actionsState.value.copy(isSubmitting = false)
                    is MutationResult.ValidationError -> {
                        _actionsState.value.copy(isSubmitting = false, message = result.message)
                    }
                    is MutationResult.Error -> {
                        _actionsState.value.copy(isSubmitting = false, message = result.message)
                    }
                }
        }
    }

    companion object {
        fun factory(
            repository: DashboardRepository,
            connectivityObserver: ConnectivityObserver = ConnectivityObserver.Disabled,
            syncSignalTransport: SyncSignalTransport? = null
        ): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                DashboardViewModel(
                    repository = repository,
                    connectivityObserver = connectivityObserver,
                    syncSignalTransport = syncSignalTransport
                )
            }
        }
    }
}

/** The value of a successful result; every failure (including a superseded request) reads as absent. */
private fun <T> MutationResult<T>.valueOrNull(): T? = (this as? MutationResult.Success)?.value

/** Parses an ISO-8601 offset date-time (accepts both a numeric offset and a `Z` suffix), or null. */
private fun parseInstantOrNull(value: String): java.time.Instant? = try {
    OffsetDateTime.parse(value).toInstant()
} catch (_: DateTimeParseException) {
    null
}
