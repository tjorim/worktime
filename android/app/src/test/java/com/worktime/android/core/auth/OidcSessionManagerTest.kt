package com.worktime.android.core.auth

import android.content.Intent
import com.worktime.android.core.storage.SecureSessionStore
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.mockkStatic
import io.mockk.unmockkAll
import io.mockk.verify
import java.io.IOException
import java.security.MessageDigest
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import net.openid.appauth.AuthState
import net.openid.appauth.AuthorizationException
import net.openid.appauth.AuthorizationService
import net.openid.appauth.IdToken
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

    private fun idToken(issuer: String, subject: String): IdToken = mockk<IdToken>(relaxed = true).also { token ->
        IdToken::class.java.getField("issuer").apply { isAccessible = true }.set(token, issuer)
        IdToken::class.java.getField("subject").apply { isAccessible = true }.set(token, subject)
    }

    private fun sha256Hex(value: String): String = MessageDigest
        .getInstance("SHA-256")
        .digest(value.toByteArray())
        .joinToString("") { "%02x".format(it) }
}
