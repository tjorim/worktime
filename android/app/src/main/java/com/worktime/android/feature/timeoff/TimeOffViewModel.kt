package com.worktime.android.feature.timeoff

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.worktime.android.data.model.TimeOffEntryRecord
import com.worktime.android.data.repository.DashboardRepository
import com.worktime.android.data.repository.MutationResult
import com.worktime.android.data.repository.TimeOffDraft
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

class TimeOffViewModel(private val repository: DashboardRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<TimeOffUiState>(TimeOffUiState.Loading)
    val uiState: StateFlow<TimeOffUiState> = _uiState.asStateFlow()
    private val _formState = MutableStateFlow(TimeOffFormState())
    val formState: StateFlow<TimeOffFormState> = _formState.asStateFlow()
    private var refreshJob: Job? = null

    init {
        refresh()
    }

    fun refresh() {
        refreshJob?.cancel()
        refreshJob =
            viewModelScope.launch {
                _uiState.value = TimeOffUiState.Loading
                _uiState.value =
                    when (val result = repository.listTimeOffEntries()) {
                        is MutationResult.Success -> TimeOffUiState.Success(result.value)
                        MutationResult.LoggedOut -> TimeOffUiState.LoggedOut
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
        viewModelScope.launch {
            _formState.value = _formState.value.copy(isSubmitting = true, message = null)
            val result =
                when (target) {
                    TimeOffFormTarget.Create -> repository.createTimeOffEntry(draft)
                    is TimeOffFormTarget.Edit -> repository.updateTimeOffEntry(target.entryId, draft)
                }
            applyMutationOutcome(result)
        }
    }

    fun delete(entryId: String) {
        if (_formState.value.isSubmitting) return
        viewModelScope.launch {
            _formState.value = _formState.value.copy(isSubmitting = true, message = null)
            applyMutationOutcome(repository.deleteTimeOffEntry(entryId))
        }
    }

    private fun applyMutationOutcome(result: MutationResult<*>) {
        _formState.value =
            when (result) {
                is MutationResult.Success -> {
                    refresh()
                    TimeOffFormState()
                }
                MutationResult.LoggedOut -> {
                    _uiState.value = TimeOffUiState.LoggedOut
                    _formState.value.copy(isSubmitting = false, message = "Session expired. Sign in again.")
                }
                is MutationResult.ValidationError ->
                    _formState.value.copy(isSubmitting = false, message = result.message)
                is MutationResult.Error ->
                    _formState.value.copy(isSubmitting = false, message = result.message)
            }
    }

    companion object {
        fun factory(repository: DashboardRepository): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                TimeOffViewModel(repository = repository)
            }
        }
    }
}
