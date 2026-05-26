package com.worktime.android.core.auth

import android.content.Context
import android.content.Intent
import android.net.Uri
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.storage.SecureSessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenRequest
import kotlin.coroutines.resume
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class OidcSessionManager(
    private val context: Context,
    private val appConfig: AppConfig,
    private val sessionStore: SecureSessionStore,
) : SessionController {
    private val tokenMutex = Mutex()
    private val _sessionState = MutableStateFlow<SessionState>(SessionState.Initializing)
    override val sessionState: StateFlow<SessionState> = _sessionState.asStateFlow()

    private var authState: AuthState? = try {
        sessionStore.readAuthStateJson()
            ?.takeIf { it.isNotBlank() }
            ?.let(AuthState::jsonDeserialize)
            ?.also(::publishState)
    } catch (e: Exception) {
        sessionStore.clear()
        null
    } ?: run {
        _sessionState.value = SessionState.LoggedOut
        null
    }

    override suspend fun createAuthorizationIntent(): Intent {
        val configuration = fetchAuthorizationServiceConfiguration()
        val request = AuthorizationRequest.Builder(
            configuration,
            appConfig.oidcClientId,
            ResponseTypeValues.CODE,
            Uri.parse(appConfig.oidcRedirectUri),
        ).setScope(appConfig.oidcScope)
            .build()

        return AuthorizationService(context).getAuthorizationRequestIntent(request)
    }

    override suspend fun handleAuthorizationResponse(intent: Intent?): Result<Unit> = runCatching {
        requireNotNull(intent) { "Missing sign-in result" }
        val response = AuthorizationResponse.fromIntent(intent)
        val exception = AuthorizationException.fromIntent(intent)
        val newState = AuthState(response, exception)

        if (response == null) {
            val message = exception?.errorDescription ?: "Sign-in was cancelled"
            _sessionState.value = SessionState.Error(message)
            throw IllegalStateException(message)
        }

        val (tokenResponse, tokenException) = performTokenRequest(response.createTokenExchangeRequest())
        newState.update(tokenResponse, tokenException)
        if (tokenException != null || tokenResponse?.accessToken.isNullOrBlank()) {
            val message = tokenException?.errorDescription ?: "Missing access token"
            _sessionState.value = SessionState.Error(message)
            throw IllegalStateException(message)
        }

        persistAuthState(newState)
    }

    override suspend fun getFreshAccessToken(): String? = tokenMutex.withLock {
        val currentState = authState ?: return null
        return suspendCancellableCoroutine { continuation ->
            val service = AuthorizationService(context)
            currentState.performActionWithFreshTokens(service) { accessToken, _, exception ->
                service.dispose()
                if (exception != null || accessToken.isNullOrBlank()) {
                    logout()
                    continuation.resume(null)
                    return@performActionWithFreshTokens
                }
                persistAuthState(currentState)
                continuation.resume(accessToken)
            }
        }
    }

    override fun logout() {
        authState = null
        sessionStore.clear()
        _sessionState.value = SessionState.LoggedOut
    }

    private suspend fun fetchAuthorizationServiceConfiguration(): AuthorizationServiceConfiguration {
        return suspendCancellableCoroutine { continuation ->
            AuthorizationServiceConfiguration.fetchFromIssuer(Uri.parse(appConfig.oidcAuthority)) { config, ex ->
                when {
                    config != null -> continuation.resume(config)
                    else -> continuation.resumeWith(Result.failure(ex ?: IllegalStateException("Failed to load OIDC configuration")))
                }
            }
        }
    }

    private suspend fun performTokenRequest(
        request: TokenRequest,
    ): Pair<net.openid.appauth.TokenResponse?, AuthorizationException?> {
        return suspendCancellableCoroutine { continuation ->
            val service = AuthorizationService(context)
            service.performTokenRequest(request) { response, ex ->
                service.dispose()
                continuation.resume(response to ex)
            }
        }
    }

    private fun persistAuthState(state: AuthState) {
        authState = state
        sessionStore.writeAuthStateJson(state.jsonSerializeString())
        publishState(state)
    }

    private fun publishState(state: AuthState) {
        _sessionState.value = SessionState.Authenticated(hasRefreshToken = !state.refreshToken.isNullOrBlank())
    }
}
