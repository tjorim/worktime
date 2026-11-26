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
import java.time.Clock
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
import kotlinx.coroutines.flow.update
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
     *
     * [refreshError] is set when the latest refresh failed while this data stayed on screen: it
     * carries the actionable copy for the failure so the banner can say why the data is old.
     */
    data class Success(
        val dashboard: DashboardResponse,
        val staleAsOf: String? = null,
        val refreshError: String? = null
    ) : DashboardUiState
}

/**
 * What the app knows about a value the backend owns. A confirmed absence (a successful read that
 * found nothing) is a different thing from not knowing, and neither is the same as holding a
 * last-known value whose latest refresh failed (#2093).
 */
enum class ReadStatus {
    /** Never successfully read in this session: the paired value is a placeholder, not an answer. */
    Unknown,

    /** The latest read succeeded: the paired value, including "nothing there", is authoritative. */
    Confirmed,

    /** A read succeeded earlier but the latest one failed: the paired value is last-known. */
    Stale
}

data class MobileActionsUiState(
    /** The running timer, or null. Only meaningful per [timerStatus]: null alone does not mean "no timer". */
    val runningTask: TaskRecord? = null,
    val timerStatus: ReadStatus = ReadStatus.Unknown,
    /** ISO-8601 instant [runningTask] was last read successfully, for "as of" copy while [ReadStatus.Stale]. */
    val timerConfirmedAt: String? = null,
    /** The soonest-starting planned task (stop_time already set, start_time still ahead), if any. */
    val plannedTask: TaskRecord? = null,
    val plannedTaskStatus: ReadStatus = ReadStatus.Unknown,
    /** True when at least one read in the latest actions refresh failed (the affected values were kept). */
    val refreshFailed: Boolean = false,
    val weeklyWorkLocations: List<WorkLocationRecord> = emptyList(),
    val labels: List<LabelRecord> = emptyList(),
    val templates: List<TemplateRecord> = emptyList(),
    val workLocationPreferences: WorkLocationPreferences = WorkLocationPreferences(),
    val syncStatus: SyncStatusResponse? = null,
    val isSubmitting: Boolean = false,
    val message: String? = null
) {
    /** Starting a timer is only safe when we know there is none running; unknown or stale could double-start. */
    val canStartTimer: Boolean get() = timerStatus == ReadStatus.Confirmed
}

@Suppress("TooManyFunctions") // one view model facade for all mobile dashboard actions
class DashboardViewModel(
    private val repository: DashboardRepository,
    connectivityObserver: ConnectivityObserver = ConnectivityObserver.Disabled,
    private val syncSignalTransport: SyncSignalTransport? = null,
    private val clock: Clock = Clock.systemUTC()
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
    // earlier session is ignored (see ownsState) instead of landing in the new session's state.
    // The same goes for the API environment (#2092): state loaded from one must not outlive a switch to another.
    private var activeSessionId: Long? = repository.sessionState.value.activeSessionId
    private var activeEnvironment: String = repository.apiEnvironment

    // ISO-8601 instant of the last successful dashboard fetch in this session, so an in-place
    // failure can say how old the data on screen is.
    private var lastDashboardRefreshAt: String? = null

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
            activeEnvironment = repository.apiEnvironment
            refreshJob?.cancel()
            actionsJob?.cancel()
            _actionsState.value = MobileActionsUiState()
            lastDashboardRefreshAt = null
            _uiState.value = DashboardUiState.Loading
            if (sessionId != null) refresh()
        }
        if (sessionState is SessionState.LoggedOut) {
            _uiState.value = DashboardUiState.LoggedOut
        }
    }

    private data class StateOwner(val sessionId: Long?, val environment: String)

    private fun currentOwner() = StateOwner(repository.sessionState.value.activeSessionId, repository.apiEnvironment)

    /**
     * Whether a result obtained under [owner] may still be applied. When only the API environment
     * moved (a changed session is handled by [onSessionState]), the result is dropped and the data
     * reloaded against the new environment.
     */
    private fun ownsState(owner: StateOwner): Boolean {
        val current = currentOwner()
        if (current == owner) return true
        if (current.sessionId == owner.sessionId) refresh()
        return false
    }

    /** Drops everything loaded from another API environment before loading from the current one. */
    private fun adoptEnvironment() {
        val environment = repository.apiEnvironment
        if (environment == activeEnvironment) return
        activeEnvironment = environment
        actionsJob?.cancel()
        _actionsState.value = MobileActionsUiState()
        lastDashboardRefreshAt = null
        _uiState.value = DashboardUiState.Loading
    }

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
        adoptEnvironment()
        val owner = currentOwner()
        refreshJob =
            viewModelScope.launch {
                // Cold start (or recovering from LoggedOut/Error): show the last cached dashboard
                // immediately, marked stale, rather than blocking on the network round trip below.
                // Skipped once a Success is already showing so an in-place refresh doesn't flicker
                // back to a possibly-older cached snapshot.
                if (_uiState.value !is DashboardUiState.Success) {
                    val cached = repository.loadCachedDashboard()
                    if (!ownsState(owner)) return@launch
                    _uiState.value =
                        if (cached != null) {
                            DashboardUiState.Success(cached.dashboard, staleAsOf = cached.cachedAt)
                        } else {
                            DashboardUiState.Loading
                        }
                }
                val result = repository.loadDashboard()
                if (!ownsState(owner)) return@launch
                when (result) {
                    is DashboardLoadResult.Success -> {
                        lastDashboardRefreshAt = clock.instant().toString()
                        refreshActions()
                        _uiState.value = DashboardUiState.Success(result.dashboard)
                    }
                    DashboardLoadResult.LoggedOut -> _uiState.value = DashboardUiState.LoggedOut
                    // Still the same session (a changed one was dropped above), so only the API
                    // environment moved under this request -- e.g. a saved override restored just
                    // after start-up. Load again against the new one.
                    DashboardLoadResult.Superseded -> refresh()
                    is DashboardLoadResult.Error -> {
                        // The action reads are independent endpoints: a recovered timer endpoint
                        // must clear a stale timer even while the dashboard itself still fails,
                        // or Start stays unavailable after a reconnect.
                        refreshActions()
                        keepDataOrShowError(result.message)
                    }
                }
            }
    }

    /**
     * A failed refresh must not read as a fresh success: keep the data on screen but mark it stale
     * with the failure copy and the age of what's shown. Only surface a hard error when there is
     * nothing to show instead.
     */
    private fun keepDataOrShowError(message: String) {
        val current = _uiState.value
        _uiState.value =
            if (current is DashboardUiState.Success) {
                current.copy(
                    staleAsOf = current.staleAsOf ?: lastDashboardRefreshAt ?: current.dashboard.asOf,
                    refreshError = message
                )
            } else {
                DashboardUiState.Error(message)
            }
    }

    fun refreshActions() {
        actionsJob?.cancel()
        actionsJob =
            viewModelScope.launch {
                refreshActionsNow()
            }
    }

    /**
     * Reads everything the Today screen needs and merges it into [actionsState] one read at a time:
     * a read that fails keeps its previous value (and is marked [ReadStatus.Stale]) instead of
     * collapsing to an empty default, so one flaky request can't make a running timer vanish or
     * wipe the labels and templates already loaded (#2093).
     */
    private suspend fun refreshActionsNow() = coroutineScope {
        val owner = currentOwner()
        val runningTaskAsync = async { repository.getRunningTask() }
        val plannedTaskAsync = async { fetchPlannedTask(repository) }
        val weeklyLocationsAsync = async { repository.loadWeeklyWorkLocations() }
        val syncStatusAsync = async { repository.loadSyncStatus() }
        val workLocationPreferencesAsync = async { repository.loadWorkLocationPreferences() }
        val labelsAsync = async { repository.listLabels() }
        val templatesAsync = async { repository.listTemplates() }
        val runningTask = runningTaskAsync.await()
        val plannedTask = plannedTaskAsync.await()
        val weeklyLocations = weeklyLocationsAsync.await()
        val syncStatus = syncStatusAsync.await()
        val workLocationPreferences = workLocationPreferencesAsync.await()
        val labels = labelsAsync.await()
        val templates = templatesAsync.await()
        if (!ownsState(owner)) return@coroutineScope
        val now = clock.instant().toString()
        _actionsState.update { current ->
            current.copy(
                runningTask = runningTask.orPrevious(current.runningTask),
                timerStatus = runningTask.statusAfter(current.timerStatus),
                timerConfirmedAt = if (runningTask is MutationResult.Success) now else current.timerConfirmedAt,
                plannedTask = plannedTask.orPrevious(current.plannedTask),
                plannedTaskStatus = plannedTask.statusAfter(current.plannedTaskStatus),
                weeklyWorkLocations = weeklyLocations.orPrevious(current.weeklyWorkLocations),
                syncStatus = syncStatus.orPrevious(current.syncStatus),
                workLocationPreferences = workLocationPreferences.orPrevious(current.workLocationPreferences),
                labels = labels.orPrevious(current.labels),
                templates = templates.orPrevious(current.templates),
                refreshFailed =
                listOf(
                    runningTask,
                    plannedTask,
                    weeklyLocations,
                    syncStatus,
                    workLocationPreferences,
                    labels,
                    templates
                ).any { it !is MutationResult.Success }
            )
        }
    }

    fun startTimeTracking(text: String, labelId: String? = null) {
        // Don't write while we can't tell whether a timer is already running: the start would
        // double-book (#2093). The screen disables Start in these states; this is the backstop.
        if (!_actionsState.value.canStartTimer) {
            _actionsState.update { it.copy(message = TIMER_STATUS_UNKNOWN_MESSAGE) }
            return
        }
        submitMutation(onSuccess = ::applyStartedTimer) { repository.startTimeTracking(text, labelId) }
    }

    fun stopTimeTracking(taskId: String) {
        submitMutation(onSuccess = ::applyStoppedTimer) { repository.stopTimeTracking(taskId) }
    }

    fun updateTask(taskId: String, text: String?, labelId: String?) {
        submitMutation(onSuccess = ::applyUpdatedTimer) {
            repository.updateTask(taskId = taskId, text = text, labelId = labelId)
        }
    }

    fun setWorkLocation(date: LocalDate, countryCode: String, label: String?) {
        submitMutation { repository.setWorkLocation(date = date, countryCode = countryCode, label = label) }
    }

    fun deleteWorkLocation(date: LocalDate) {
        submitMutation { repository.deleteWorkLocation(date) }
    }

    fun createLabel(name: String, color: String) {
        submitMutation { repository.createLabel(name, color) }
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

    // A write that succeeded is known, so apply it before the follow-up read: if that read fails,
    // the screen must not keep offering to stop a timer we just stopped (a second Stop would move
    // the recorded stop time) or hide one we just started (#2093).
    private fun applyStartedTimer(task: TaskRecord, state: MobileActionsUiState) = state.copy(
        runningTask = task,
        timerStatus = ReadStatus.Confirmed,
        timerConfirmedAt = clock.instant().toString()
    )

    private fun applyStoppedTimer(task: TaskRecord, state: MobileActionsUiState): MobileActionsUiState {
        if (state.runningTask?.id != task.id) return state
        return state.copy(
            runningTask = null,
            timerStatus = ReadStatus.Confirmed,
            timerConfirmedAt = clock.instant().toString()
        )
    }

    private fun applyUpdatedTimer(task: TaskRecord, state: MobileActionsUiState) =
        if (state.runningTask?.id == task.id && task.stopTime == null) state.copy(runningTask = task) else state

    private fun <T> submitMutation(
        onSuccess: (T, MobileActionsUiState) -> MobileActionsUiState = { _, state -> state },
        block: suspend () -> MutationResult<T>
    ) {
        val owner = currentOwner()
        viewModelScope.launch {
            _actionsState.value = _actionsState.value.copy(isSubmitting = true, message = null)
            val result = block()
            if (!ownsState(owner)) return@launch
            _actionsState.value =
                when (result) {
                    is MutationResult.Success -> {
                        refreshActions()
                        onSuccess(result.value, _actionsState.value).copy(isSubmitting = false, message = "Saved")
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
        private const val TIMER_STATUS_UNKNOWN_MESSAGE =
            "Couldn't check your running timer yet. Retry once it loads."

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

/** The freshly read value, or [previous] when this read failed. A successful null (confirmed absence) wins. */
private fun <T> MutationResult<T>.orPrevious(previous: T): T = if (this is MutationResult.Success) value else previous

private fun MutationResult<*>.statusAfter(previous: ReadStatus): ReadStatus = when {
    this is MutationResult.Success -> ReadStatus.Confirmed
    previous == ReadStatus.Unknown -> ReadStatus.Unknown
    else -> ReadStatus.Stale
}

/** Parses an ISO-8601 offset date-time (accepts both a numeric offset and a `Z` suffix), or null. */
private fun parseInstantOrNull(value: String): java.time.Instant? = try {
    OffsetDateTime.parse(value).toInstant()
} catch (_: DateTimeParseException) {
    null
}
