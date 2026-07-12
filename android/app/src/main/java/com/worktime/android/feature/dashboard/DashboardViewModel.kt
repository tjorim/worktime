package com.worktime.android.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
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
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface DashboardUiState {
    data object Loading : DashboardUiState

    data object LoggedOut : DashboardUiState

    data class Error(val message: String) : DashboardUiState

    data class Success(val dashboard: DashboardResponse) : DashboardUiState
}

data class MobileActionsUiState(
    val runningTask: TaskRecord? = null,
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
class DashboardViewModel(private val repository: DashboardRepository) : ViewModel() {
    private val _uiState = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()
    private val _actionsState = MutableStateFlow(MobileActionsUiState())
    val actionsState: StateFlow<MobileActionsUiState> = _actionsState.asStateFlow()
    private var refreshJob: Job? = null

    init {
        viewModelScope.launch {
            repository.sessionState.collect { sessionState ->
                if (sessionState is com.worktime.android.core.auth.SessionState.LoggedOut) {
                    _uiState.value = DashboardUiState.LoggedOut
                }
            }
        }
        refresh()
    }

    fun refresh() {
        refreshJob?.cancel()
        refreshJob =
            viewModelScope.launch {
                _uiState.value = DashboardUiState.Loading
                _uiState.value =
                    when (val result = repository.loadDashboard()) {
                        is DashboardLoadResult.Success -> {
                            refreshActions()
                            DashboardUiState.Success(result.dashboard)
                        }
                        DashboardLoadResult.LoggedOut -> DashboardUiState.LoggedOut
                        is DashboardLoadResult.Error -> DashboardUiState.Error(result.message)
                    }
            }
    }

    fun refreshActions() {
        viewModelScope.launch {
            val runningTaskDeferred =
                async {
                    when (val result = repository.getRunningTask()) {
                        is MutationResult.Success -> result.value
                        else -> null
                    }
                }
            val weeklyLocationsDeferred =
                async {
                    when (val result = repository.loadWeeklyWorkLocations()) {
                        is MutationResult.Success -> result.value
                        else -> emptyList()
                    }
                }
            val syncStatusDeferred =
                async {
                    when (val result = repository.loadSyncStatus()) {
                        is MutationResult.Success -> result.value
                        else -> null
                    }
                }
            val workLocationPreferencesDeferred =
                async {
                    when (val result = repository.loadWorkLocationPreferences()) {
                        is MutationResult.Success -> result.value
                        else -> WorkLocationPreferences()
                    }
                }
            val labelsDeferred =
                async {
                    when (val result = repository.listLabels()) {
                        is MutationResult.Success -> result.value
                        else -> emptyList()
                    }
                }
            val templatesDeferred =
                async {
                    when (val result = repository.listTemplates()) {
                        is MutationResult.Success -> result.value
                        else -> emptyList()
                    }
                }
            _actionsState.value =
                _actionsState.value.copy(
                    runningTask = runningTaskDeferred.await(),
                    weeklyWorkLocations = weeklyLocationsDeferred.await(),
                    syncStatus = syncStatusDeferred.await(),
                    workLocationPreferences = workLocationPreferencesDeferred.await(),
                    labels = labelsDeferred.await(),
                    templates = templatesDeferred.await()
                )
        }
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

    fun logout() {
        viewModelScope.launch {
            repository.logout()
            _uiState.value = DashboardUiState.LoggedOut
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            _actionsState.value = _actionsState.value.copy(isDeletingAccount = true, deleteAccountError = null)
            when (val result = repository.deleteAccount()) {
                is MutationResult.Success -> {
                    _uiState.value = DashboardUiState.LoggedOut
                    _actionsState.value = _actionsState.value.copy(isDeletingAccount = false)
                }
                MutationResult.LoggedOut -> {
                    _uiState.value = DashboardUiState.LoggedOut
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
        viewModelScope.launch {
            _actionsState.value = _actionsState.value.copy(isSubmitting = true, message = null)
            _actionsState.value =
                when (val result = block()) {
                    is MutationResult.Success -> {
                        refreshActions()
                        _actionsState.value.copy(isSubmitting = false, message = "Saved")
                    }
                    MutationResult.LoggedOut -> {
                        _uiState.value = DashboardUiState.LoggedOut
                        _actionsState.value.copy(isSubmitting = false, message = "Session expired. Sign in again.")
                    }
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
        fun factory(repository: DashboardRepository): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                DashboardViewModel(repository = repository)
            }
        }
    }
}
