package com.worktime.android.feature.timeoff

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.worktime.android.core.auth.SessionState
import com.worktime.android.core.auth.activeSessionId
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import com.worktime.android.data.repository.TimeOffDraft
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

sealed interface TimeOffUiState {
    data object Loading : TimeOffUiState

    data object LoggedOut : TimeOffUiState

    data class Error(val message: String) : TimeOffUiState

    data class Success(val entries: List<TimeOffEntryRecord>) : TimeOffUiState
}

/** Which form, if any, is currently presented over the time-off list. */
sealed interface TimeOffFormTarget {
    data object Create : TimeOffFormTarget

    data class Edit(val entryId: String) : TimeOffFormTarget
}

data class TimeOffFormState(
    val target: TimeOffFormTarget? = null,
    val isSubmitting: Boolean = false,
    val message: String? = null
)

@Suppress("TooManyFunctions") // list, form and session-scoping handlers of one screen
class TimeOffViewModel(private val repository: DashboardRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<TimeOffUiState>(TimeOffUiState.Loading)
    val uiState: StateFlow<TimeOffUiState> = _uiState.asStateFlow()
    private val _formState = MutableStateFlow(TimeOffFormState())
    val formState: StateFlow<TimeOffFormState> = _formState.asStateFlow()
    private var refreshJob: Job? = null

    // Entries and an open form belong to one signed-in session (#2092): when it changes they are
    // dropped, and a response that began under an earlier session is ignored (see isActive).
    private var activeSessionId: Long? = repository.sessionState.value.activeSessionId

    init {
        viewModelScope.launch { repository.sessionState.collect(::onSessionState) }
        refresh()
    }

    private fun onSessionState(sessionState: SessionState) {
        val sessionId = sessionState.activeSessionId
        if (sessionId == activeSessionId) return
        activeSessionId = sessionId
        refreshJob?.cancel()
        _formState.value = TimeOffFormState()
        if (sessionId == null) {
            _uiState.value = TimeOffUiState.LoggedOut
        } else {
            refresh()
        }
    }

    /** Whether [sessionId] is still the signed-in session, i.e. a result obtained under it may be applied. */
    private fun isActive(sessionId: Long?): Boolean = repository.sessionState.value.activeSessionId == sessionId

    fun refresh() {
        refreshJob?.cancel()
        val sessionId = repository.sessionState.value.activeSessionId
        refreshJob =
            viewModelScope.launch {
                _uiState.value = TimeOffUiState.Loading
                val result = repository.listTimeOffEntries()
                if (!isActive(sessionId)) return@launch
                _uiState.value =
                    when (result) {
                        is MutationResult.Success -> TimeOffUiState.Success(result.value)
                        MutationResult.LoggedOut -> TimeOffUiState.LoggedOut
                        // Only the API environment changed under the request: ask again.
                        MutationResult.Superseded -> {
                            refresh()
                            TimeOffUiState.Loading
                        }
                        is MutationResult.ValidationError -> TimeOffUiState.Error(result.message)
                        is MutationResult.Error -> TimeOffUiState.Error(result.message)
                    }
            }
    }

    fun openCreateForm() {
        _formState.value = TimeOffFormState(target = TimeOffFormTarget.Create)
    }

    fun openEditForm(entryId: String) {
        _formState.value = TimeOffFormState(target = TimeOffFormTarget.Edit(entryId))
    }

    fun closeForm() {
        _formState.value = TimeOffFormState()
    }

    fun submit(draft: TimeOffDraft) {
        if (_formState.value.isSubmitting) return
        val target = _formState.value.target ?: return
        val sessionId = repository.sessionState.value.activeSessionId
        viewModelScope.launch {
            _formState.value = _formState.value.copy(isSubmitting = true, message = null)
            val result =
                when (target) {
                    TimeOffFormTarget.Create -> repository.createTimeOffEntry(draft)
                    is TimeOffFormTarget.Edit -> repository.updateTimeOffEntry(target.entryId, draft)
                }
            if (!isActive(sessionId)) return@launch
            applyUpsertOutcome(result)
        }
    }

    fun delete(entryId: String) {
        if (_formState.value.isSubmitting) return
        val sessionId = repository.sessionState.value.activeSessionId
        viewModelScope.launch {
            _formState.value = _formState.value.copy(isSubmitting = true, message = null)
            val result = repository.deleteTimeOffEntry(entryId)
            if (!isActive(sessionId)) return@launch
            applyDeleteOutcome(entryId, result)
        }
    }

    private fun applyUpsertOutcome(result: MutationResult<TimeOffEntryRecord>) {
        _formState.value =
            when (result) {
                is MutationResult.Success -> {
                    upsertEntry(result.value)
                    TimeOffFormState()
                }
                MutationResult.LoggedOut -> {
                    _uiState.value = TimeOffUiState.LoggedOut
                    _formState.value.copy(isSubmitting = false, message = "Session expired. Sign in again.")
                }
                MutationResult.Superseded -> _formState.value.copy(isSubmitting = false)
                is MutationResult.ValidationError ->
                    _formState.value.copy(isSubmitting = false, message = result.message)
                is MutationResult.Error ->
                    _formState.value.copy(isSubmitting = false, message = result.message)
            }
    }

    private fun applyDeleteOutcome(entryId: String, result: MutationResult<Unit>) {
        _formState.value =
            when (result) {
                is MutationResult.Success -> {
                    removeEntry(entryId)
                    TimeOffFormState()
                }
                MutationResult.LoggedOut -> {
                    _uiState.value = TimeOffUiState.LoggedOut
                    _formState.value.copy(isSubmitting = false, message = "Session expired. Sign in again.")
                }
                MutationResult.Superseded -> _formState.value.copy(isSubmitting = false)
                is MutationResult.ValidationError ->
                    _formState.value.copy(isSubmitting = false, message = result.message)
                is MutationResult.Error ->
                    _formState.value.copy(isSubmitting = false, message = result.message)
            }
    }

    private fun upsertEntry(entry: TimeOffEntryRecord) {
        _uiState.update { current ->
            if (current !is TimeOffUiState.Success) return@update current
            val entries = current.entries.filterNot { it.entryId == entry.entryId } + entry
            current.copy(
                entries =
                entries.sortedWith(
                    compareBy<TimeOffEntryRecord> { sortDate(it) }.thenBy { it.entryId }
                )
            )
        }
    }

    private fun removeEntry(entryId: String) {
        _uiState.update { current ->
            if (current is TimeOffUiState.Success) {
                current.copy(entries = current.entries.filterNot { it.entryId == entryId })
            } else {
                current
            }
        }
    }

    private fun sortDate(entry: TimeOffEntryRecord): String =
        entry.date ?: entry.startDate ?: entry.weekday?.toString()?.padStart(2, '0') ?: entry.entryId

    companion object {
        fun factory(repository: DashboardRepository): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                TimeOffViewModel(repository = repository)
            }
        }
    }
}
