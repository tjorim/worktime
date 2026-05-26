package com.worktime.android.feature.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.repository.DashboardLoadResult
import com.worktime.android.data.repository.DashboardRepository
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

class DashboardViewModel(
    private val repository: DashboardRepository,
) : ViewModel() {
    private val _uiState = MutableStateFlow<DashboardUiState>(DashboardUiState.Loading)
    val uiState: StateFlow<DashboardUiState> = _uiState.asStateFlow()

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
        viewModelScope.launch {
            _uiState.value = DashboardUiState.Loading
            _uiState.value = when (val result = repository.loadDashboard()) {
                is DashboardLoadResult.Success -> DashboardUiState.Success(result.dashboard)
                DashboardLoadResult.LoggedOut -> DashboardUiState.LoggedOut
                is DashboardLoadResult.Error -> DashboardUiState.Error(result.message)
            }
        }
    }

    fun logout() {
        repository.logout()
        _uiState.value = DashboardUiState.LoggedOut
    }

    companion object {
        fun factory(repository: DashboardRepository): ViewModelProvider.Factory = viewModelFactory {
            initializer {
                DashboardViewModel(repository = repository)
            }
        }
    }
}
