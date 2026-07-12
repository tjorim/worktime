package com.worktime.android.core.auth

import android.content.Context
import android.content.Intent
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.storage.ApiBaseUrlOverrideStore
import com.worktime.android.core.storage.SecureSessionStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.EndSessionRequest
import net.openid.appauth.ResponseTypeValues
import net.openid.appauth.TokenRequest

@Singleton
class OidcSessionManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val appConfig: AppConfig,
    private val oidcConfig: OidcConfig,
    private val sessionStore: SecureSessionStore,
    private val apiBaseUrlOverrideStore: ApiBaseUrlOverrideStore,
    // Discovery returns the endpoints the whole auth flow trusts, so it must be
    // pinned exactly like the API client; a plain OkHttpClient would let a
    // MITM with a rogue CA swap in attacker-controlled authorization/token URLs.
    private val oidcDiscovery: OidcServiceConfigurationDiscovery
) : SessionController {
    private val tokenMutex = Mutex()
    private val configMutex = Mutex()
    private val _sessionState = MutableStateFlow<SessionState>(SessionState.Initializing)
    override val sessionState: StateFlow<SessionState> = _sessionState.asStateFlow()
    private var cachedConfiguration: Pair<String, AuthorizationServiceConfiguration>? = null

    @Volatile
    private var authState: AuthState? =
        try {
            sessionStore
                .readAuthStateJson()
                ?.takeIf { it.isNotBlank() }
                ?.let(AuthState::jsonDeserialize)
                ?.also(::publishState)
        } catch (_: Exception) {
            // readAuthStateJson() is backed by EncryptedSharedPreferences, which can throw
            // GeneralSecurityException/IOException if the Android Keystore key is lost or
            // corrupted, not just JSONException from malformed AuthState JSON. Treat any of
            // these as a logged-out state rather than crashing on startup.
            sessionStore.clear()
            null
        } ?: run {
            _sessionState.value = SessionState.LoggedOut
            null
        }

    override suspend fun createAuthorizationIntent(): Intent {
        val configuration = fetchAuthorizationServiceConfiguration()
        val request =
            AuthorizationRequest
                .Builder(
                    configuration,
                    oidcConfig.clientId,
                    ResponseTypeValues.CODE,
                    oidcConfig.redirectUri
                ).setScope(oidcConfig.scope)
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
                    clearLocalSession()
                    continuation.resume(null)
                    return@performActionWithFreshTokens
                }
                persistAuthState(currentState)
                continuation.resume(accessToken)
            }
        }
    }

    override suspend fun logout() {
        val stateToEnd = authState
        runCatching {
            val configuration = fetchAuthorizationServiceConfiguration()
            if (configuration.endSessionEndpoint == null) return@runCatching
            val builder =
                EndSessionRequest
                    .Builder(configuration)
                    .setPostLogoutRedirectUri(oidcConfig.redirectUri)
            stateToEnd?.idToken?.let(builder::setIdTokenHint)
            val request = builder.build()
            val service = AuthorizationService(context)
            val intent = service.getEndSessionRequestIntent(request).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            service.dispose()
        }
        clearLocalSession()
    }

    private fun clearLocalSession() {
        authState = null
        sessionStore.clear()
        _sessionState.value = SessionState.LoggedOut
    }

    private suspend fun fetchAuthorizationServiceConfiguration(): AuthorizationServiceConfiguration {
        val apiBaseUrl = apiBaseUrlOverrideStore.override.value ?: appConfig.apiBaseUrl
        cachedConfiguration?.takeIf { it.first == apiBaseUrl }?.let { return it.second }
        return configMutex.withLock {
            cachedConfiguration?.takeIf { it.first == apiBaseUrl }?.second
                ?: oidcDiscovery.fetch(apiBaseUrl).also { cachedConfiguration = apiBaseUrl to it }
        }
    }

    private suspend fun performTokenRequest(
        request: TokenRequest
    ): Pair<net.openid.appauth.TokenResponse?, AuthorizationException?> = suspendCancellableCoroutine { continuation ->
        val service = AuthorizationService(context)
        service.performTokenRequest(request) { response, ex ->
            service.dispose()
            continuation.resume(response to ex)
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
