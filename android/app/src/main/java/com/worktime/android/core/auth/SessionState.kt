package com.worktime.android.core.auth

sealed interface SessionState {
    data object Initializing : SessionState

    data object LoggedOut : SessionState

    /**
     * [sessionId] is unique per sign-in (or restore after a process restart) and unchanged by token
     * refreshes, so everything tied to one session -- in-flight responses, cached reads, UI action
     * state -- can be discarded the moment it differs. [accountKey] is a stable opaque digest of the
     * principal (issuer and subject) and is null when the token carries no identity, in which case
     * nothing may be persisted for the session.
     */
    data class Authenticated(val hasRefreshToken: Boolean, val sessionId: Long = 0, val accountKey: String? = null) :
        SessionState

    data class Error(val message: String) : SessionState
}

/** The [SessionState.Authenticated.sessionId] of the signed-in session, or null when there is none. */
val SessionState.activeSessionId: Long?
    get() = (this as? SessionState.Authenticated)?.sessionId

interface SessionController {
    val sessionState: kotlinx.coroutines.flow.StateFlow<SessionState>

    suspend fun createAuthorizationIntent(): android.content.Intent

    suspend fun handleAuthorizationResponse(intent: android.content.Intent?): Result<Unit>

    /** Returns null when sign-in is required; throws IOException for retryable refresh failures. */
    suspend fun getFreshAccessToken(): String?

    /**
     * Forced/non-interactive sign-out: best-effort fires the provider end-session
     * intent (fire-and-forget, no Activity required) and clears local state
     * immediately. Used by automatic paths (e.g. a 401 from an API call) that have
     * no Activity to launch an interactive flow from and no user action to wait on.
     */
    suspend fun logout()

    /**
     * Builds the provider end-session intent without touching local state, so an
     * interactive caller can launch it via an Activity result launcher and defer
     * [completeLogout] until that launched activity actually returns control to
     * the app. Returns null when there is nothing to end at the provider (no
     * end-session endpoint, or discovery/build fails) — the caller should treat
     * that the same as an already-finished flow and call [completeLogout] right away.
     */
    suspend fun buildLogoutIntent(): android.content.Intent?

    /** Clears local session state. Pairs with [buildLogoutIntent] for the interactive sign-out flow. */
    fun completeLogout()
}
