package com.worktime.android.core.auth

import android.content.Intent
import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.storage.ApiBaseUrlOverrideStore
import com.worktime.android.core.storage.SecureSessionStore
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationRequest
import net.openid.appauth.AuthorizationResponse
import net.openid.appauth.AuthorizationService
import net.openid.appauth.AuthorizationServiceConfiguration
import net.openid.appauth.IdToken
import net.openid.appauth.TokenResponse
import net.openid.appauth.browser.BrowserSelector
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class OidcSessionManagerTest {
    private val store = mockk<SecureSessionStore>(relaxed = true)
    private val state = mockk<AuthState>(relaxed = true)
    private lateinit var manager: OidcSessionManager
    private lateinit var callback: AuthState.AuthStateAction
    private val restoredSession =
        SessionState.Authenticated(
            hasRefreshToken = true,
            sessionId = 1,
            accountKey = sha256Hex("https://issuer.example\nuser-a")
        )

    @Before
    fun setUp() {
        mockkStatic(AuthState::class)
        mockkConstructor(AuthorizationService::class)
        mockkConstructor(Intent::class)
        every { anyConstructed<Intent>().setAction(any()) } returns mockk(relaxed = true)
        mockkStatic(BrowserSelector::class)
        every { BrowserSelector.select(any(), any()) } returns null
        every { anyConstructed<AuthorizationService>().dispose() } returns Unit
        every { store.readAuthStateJson() } returns "saved"
        every { AuthState.jsonDeserialize("saved") } returns state
        every { state.refreshToken } returns "refresh"
        every { state.parsedIdToken } returns idToken(issuer = "https://issuer.example", subject = "user-a")
        every { state.jsonSerializeString() } returns "rotated"
        every { state.performActionWithFreshTokens(any(), any<AuthState.AuthStateAction>()) } answers {
            callback = secondArg()
        }
        manager = OidcSessionManager(mockk(relaxed = true), mockk(), mockk(), store, mockk(), mockk())
    }

    @After
    fun tearDown() = unmockkAll()

    @Test
    fun `temporary failures preserve session and allow retry`() = runTest {
        val errors = listOf(
            AuthorizationException.GeneralErrors.NETWORK_ERROR,
            AuthorizationException.fromOAuthTemplate(
                AuthorizationException.TokenRequestErrors.OTHER,
                "server_error",
                null,
                null
            ),
            AuthorizationException.fromOAuthTemplate(
                AuthorizationException.TokenRequestErrors.OTHER,
                "temporarily_unavailable",
                null,
                null
            ),
            null
        )
        for (error in errors) {
            val result = async { runCatching { manager.getFreshAccessToken() } }
            runCurrent()
            callback.execute(null, null, error)
            assertTrue(result.await().exceptionOrNull() is IOException)
            assertEquals(restoredSession, manager.sessionState.value)
        }
        verify(exactly = 0) { store.clear() }
        verify(exactly = 0) { store.writeAuthStateJson(any()) }
        val retry = async { manager.getFreshAccessToken() }
        runCurrent()
        callback.execute("fresh", null, null)
        assertEquals("fresh", retry.await())
        verify { store.writeAuthStateJson("rotated") }
    }

    @Test
    fun `invalid grant clears saved session`() = runTest {
        val result = async { manager.getFreshAccessToken() }
        runCurrent()
        callback.execute(null, null, AuthorizationException.TokenRequestErrors.INVALID_GRANT)
        assertNull(result.await())
        assertEquals(SessionState.LoggedOut, manager.sessionState.value)
        verify(exactly = 1) { store.clear() }
    }

    @Test
    fun `cancelled caller keeps refresh serialized until callback finishes`() = runTest {
        val first = async { manager.getFreshAccessToken() }
        runCurrent()
        val firstCallback = callback
        first.cancel()
        val second = async { manager.getFreshAccessToken() }
        runCurrent()
        verify(exactly = 1) { state.performActionWithFreshTokens(any(), any<AuthState.AuthStateAction>()) }
        firstCallback.execute("rotated", null, null)
        runCurrent()
        callback.execute("fresh", null, null)
        assertEquals("fresh", second.await())
    }

    @Test
    fun `cancelled caller receives cancellation even when refresh fails`() = runTest {
        var failure: Throwable? = null
        val caller = launch { failure = runCatching { manager.getFreshAccessToken() }.exceptionOrNull() }
        runCurrent()
        caller.cancel()
        callback.execute(null, null, AuthorizationException.GeneralErrors.NETWORK_ERROR)
        caller.join()
        assertTrue(failure is CancellationException)
        verify(exactly = 0) { store.clear() }
    }

    @Test
    fun `late refresh cannot restore logged out session`() = runTest {
        val result = async { manager.getFreshAccessToken() }
        runCurrent()
        manager.completeLogout()
        callback.execute("fresh", null, null)
        assertNull(result.await())
        verify(exactly = 0) { store.writeAuthStateJson(any()) }
    }

    @Test
    fun `restoring a saved session identifies the principal without exposing it`() {
        val session = manager.sessionState.value as SessionState.Authenticated
        assertEquals(restoredSession, session)
        assertTrue(
            "https://issuer.example" !in session.accountKey.orEmpty() && "user-a" !in session.accountKey.orEmpty()
        )
    }

    @Test
    fun `token refresh keeps the same session`() = runTest {
        val result = async { manager.getFreshAccessToken() }
        runCurrent()
        callback.execute("fresh", null, null)
        assertEquals("fresh", result.await())
        assertEquals(restoredSession, manager.sessionState.value)
    }

    @Test
    fun `a token without an identity yields no account key`() {
        every { state.parsedIdToken } returns null
        val withoutIdentity = OidcSessionManager(mockk(relaxed = true), mockk(), mockk(), store, mockk(), mockk())
        assertEquals(
            SessionState.Authenticated(hasRefreshToken = true, sessionId = 1, accountKey = null),
            withoutIdentity.sessionState.value
        )
    }

    @Test
    fun `different principals get different account keys`() {
        every { state.parsedIdToken } returns idToken(issuer = "https://issuer.example", subject = "user-b")
        val other = OidcSessionManager(mockk(relaxed = true), mockk(), mockk(), store, mockk(), mockk())
        val keyB = (other.sessionState.value as SessionState.Authenticated).accountKey
        assertTrue(keyB != null && keyB != restoredSession.accountKey)
    }

    @Test
    fun `refresh without an id token keeps the established account`() = runTest {
        // OIDC lets a refresh response omit the ID token; AppAuth then has none to expose.
        every { state.parsedIdToken } returns null
        val result = async { manager.getFreshAccessToken() }
        runCurrent()
        callback.execute("fresh", null, null)
        assertEquals("fresh", result.await())
        assertEquals(restoredSession, manager.sessionState.value)
        verify { store.writeAccountKey(restoredSession.accountKey) }
    }

    @Test
    fun `restore uses the persisted account when the saved state has no id token`() {
        every { state.parsedIdToken } returns null
        every { store.readAccountKey() } returns restoredSession.accountKey
        val restarted = OidcSessionManager(mockk(relaxed = true), mockk(), mockk(), store, mockk(), mockk())
        assertEquals(restoredSession, restarted.sessionState.value)
    }

    @Test
    fun `a new sign-in starts a new session and does not inherit the previous account`() = runTest {
        stubSignIn(subject = "user-b")
        every { state.parsedIdToken } returns null

        handleSignIn().let { assertTrue(it.exceptionOrNull()?.stackTraceToString(), it.isSuccess) }

        assertEquals(
            SessionState.Authenticated(true, sessionId = 2, accountKey = sha256Hex("https://issuer.example\nuser-b")),
            manager.sessionState.value
        )
        verify { store.writeAccountKey(sha256Hex("https://issuer.example\nuser-b")) }
    }

    @Test
    fun `a new sign-in without an identity does not keep the previous account`() = runTest {
        stubSignIn(subject = null)

        handleSignIn().let { assertTrue(it.exceptionOrNull()?.stackTraceToString(), it.isSuccess) }

        assertEquals(
            SessionState.Authenticated(true, sessionId = 2, accountKey = null),
            manager.sessionState.value
        )
        verify { store.writeAccountKey(null) }
    }

    @Test
    fun `sign-in waits for an in-flight refresh instead of interleaving with it`() = runTest {
        stubSignIn(subject = "user-b")
        val refresh = async { manager.getFreshAccessToken() }
        runCurrent()
        val signIn = async { manager.handleAuthorizationResponse(mockk(relaxed = true)) }
        runCurrent()
        assertEquals(restoredSession, manager.sessionState.value)

        callback.execute("fresh", null, null)
        runCurrent()

        assertEquals("fresh", refresh.await())
        assertTrue(signIn.await().isSuccess)
        assertEquals(
            SessionState.Authenticated(true, sessionId = 2, accountKey = sha256Hex("https://issuer.example\nuser-b")),
            manager.sessionState.value
        )
    }

    @Test
    fun `logout that finishes after another sign-in does not end the new session`() = runTest {
        stubSignIn(subject = "user-b")
        val discoveryGate = CompletableDeferred<Unit>()
        val discovery = mockk<OidcServiceConfigurationDiscovery>()
        coEvery { discovery.fetch(any()) } coAnswers {
            discoveryGate.await()
            mockk<AuthorizationServiceConfiguration>(relaxed = true)
        }
        val appConfig = mockk<AppConfig> { every { apiBaseUrl } returns "https://api.example" }
        val overrideStore =
            mockk<ApiBaseUrlOverrideStore> { every { override } returns MutableStateFlow<String?>(null) }
        val signedIn = OidcSessionManager(mockk(relaxed = true), appConfig, mockk(), store, overrideStore, discovery)
        val logout = async { signedIn.logout() }
        runCurrent()

        assertTrue(signedIn.handleAuthorizationResponse(mockk(relaxed = true)).isSuccess)
        discoveryGate.complete(Unit)
        logout.await()

        assertEquals(2L, (signedIn.sessionState.value as SessionState.Authenticated).sessionId)
        verify(exactly = 0) { store.clear() }
    }

    @Test
    fun `logout ends the session it was made for`() = runTest {
        val discovery = mockk<OidcServiceConfigurationDiscovery>()
        coEvery { discovery.fetch(any()) } returns mockk<AuthorizationServiceConfiguration>(relaxed = true)
        val appConfig = mockk<AppConfig> { every { apiBaseUrl } returns "https://api.example" }
        val overrideStore =
            mockk<ApiBaseUrlOverrideStore> { every { override } returns MutableStateFlow<String?>(null) }
        val signedIn = OidcSessionManager(mockk(relaxed = true), appConfig, mockk(), store, overrideStore, discovery)

        signedIn.logout()

        assertEquals(SessionState.LoggedOut, signedIn.sessionState.value)
        verify(exactly = 1) { store.clear() }
    }

    private suspend fun handleSignIn() = manager.handleAuthorizationResponse(mockk(relaxed = true))

    /** Models a completed code exchange whose ID token (if any) names [subject]. */
    private fun stubSignIn(subject: String?) {
        mockkStatic(AuthorizationResponse::class)
        mockkStatic(AuthorizationException::class)
        mockkConstructor(AuthState::class)
        val response = mockk<AuthorizationResponse>(relaxed = true)
        AuthorizationResponse::class.java.getField("request").apply { isAccessible = true }
            .set(response, mockk<AuthorizationRequest>(relaxed = true))
        every { AuthorizationResponse.fromIntent(any()) } returns response
        every { AuthorizationException.fromIntent(any()) } returns null
        val tokenResponse = mockk<TokenResponse>(relaxed = true)
        TokenResponse::class.java.getField("accessToken").apply { isAccessible = true }.set(tokenResponse, "access")
        every { anyConstructed<AuthorizationService>().performTokenRequest(any(), any()) } answers {
            secondArg<AuthorizationService.TokenResponseCallback>().onTokenRequestCompleted(tokenResponse, null)
        }
        every { anyConstructed<AuthState>().parsedIdToken } returns
            subject?.let { idToken(issuer = "https://issuer.example", subject = it) }
        every { anyConstructed<AuthState>().refreshToken } returns "refresh-b"
        every { anyConstructed<AuthState>().jsonSerializeString() } returns "signed-in"
    }

    private fun idToken(issuer: String, subject: String): IdToken = mockk<IdToken>(relaxed = true).also { token ->
        IdToken::class.java.getField("issuer").apply { isAccessible = true }.set(token, issuer)
        IdToken::class.java.getField("subject").apply { isAccessible = true }.set(token, subject)
    }

    private fun sha256Hex(value: String): String = MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray())
        .joinToString("") { "%02x".format(it) }
}
