package com.worktime.android.core.auth

sealed interface SessionState {
    data object Initializing : SessionState

    data object LoggedOut : SessionState

    data class Authenticated(val hasRefreshToken: Boolean) : SessionState

    data class Error(val message: String) : SessionState
}

interface SessionController {
    val sessionState: kotlinx.coroutines.flow.StateFlow<SessionState>

    suspend fun createAuthorizationIntent(): android.content.Intent

    suspend fun handleAuthorizationResponse(intent: android.content.Intent?): Result<Unit>

    suspend fun getFreshAccessToken(): String?

    fun logout()
}
