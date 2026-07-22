package com.worktime.android.core.auth

import androidx.biometric.BiometricPrompt
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BiometricAuthenticatorTest {
    @Test
    fun `isVerifiedUnlock is false for a null crypto object`() {
        val cryptoObject: BiometricPrompt.CryptoObject? = null

        assertFalse(cryptoObject.isVerifiedUnlock())
    }

    @Test
    fun `isVerifiedUnlock is false when the cipher was never initialized`() {
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        assertFalse(cryptoObject.isVerifiedUnlock())
    }

    @Test
    fun `isVerifiedUnlock is true when the cipher completes a real operation`() {
        val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding").apply { init(Cipher.ENCRYPT_MODE, key) }
        val cryptoObject = BiometricPrompt.CryptoObject(cipher)

        assertTrue(cryptoObject.isVerifiedUnlock())
    }
}
