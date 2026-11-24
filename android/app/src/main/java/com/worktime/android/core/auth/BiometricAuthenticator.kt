package com.worktime.android.core.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

sealed interface BiometricAvailability {
    data object Available : BiometricAvailability

    data class Unavailable(val message: String) : BiometricAvailability
}

/** Arbitrary single-byte input; only whether the cipher accepts it, not the output, matters. */
private val CRYPTO_VERIFICATION_PAYLOAD = ByteArray(1)

/**
 * A successful [BiometricPrompt] callback only reflects a real keystore-verified unlock once we
 * perform an operation through the returned cipher — a non-null [BiometricPrompt.CryptoObject]
 * alone isn't proof the key was actually unlocked by the biometric hardware.
 */
internal fun BiometricPrompt.CryptoObject?.isVerifiedUnlock(): Boolean {
    val cipher = this?.cipher ?: return false
    return runCatching { cipher.doFinal(CRYPTO_VERIFICATION_PAYLOAD) }.isSuccess
}

/**
 * Wraps the system `BiometricPrompt` and binds a successful prompt to a real
 * AndroidKeyStore-backed [Cipher] operation, so a successful callback reflects an actual
 * cryptographic unlock rather than a boolean flag that could be forged by a compromised caller.
 * If the keystore key was invalidated (e.g. the user changed their enrolled biometrics), a fresh
 * key is generated transparently rather than crashing.
 *
 * The prompt is created together with the authenticator, not on [authenticate]. `BiometricPrompt`
 * re-registers its callbacks with an already-showing prompt fragment when it is constructed for a
 * recreated activity, so building the authenticator for the new host (as soon as the gate is
 * composed) is what reattaches a prompt that survived rotation instead of orphaning its result.
 */
class BiometricAuthenticator(
    private val activity: FragmentActivity,
    private val onSuccess: () -> Unit,
    private val onError: (String) -> Unit
) {
    private val allowedAuthenticators =
        BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL

    private val prompt =
        BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    if (!result.cryptoObject.isVerifiedUnlock()) {
                        onError("Authentication could not be cryptographically verified.")
                        return
                    }
                    onSuccess()
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onError(errString.toString())
                }
            }
        )

    fun checkAvailability(): BiometricAvailability =
        when (BiometricManager.from(activity).canAuthenticate(allowedAuthenticators)) {
            BiometricManager.BIOMETRIC_SUCCESS -> BiometricAvailability.Available
            BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED ->
                BiometricAvailability.Unavailable(
                    "No biometric or device credential is set up on this device. Add one in your device " +
                        "settings, or turn off app lock in Worktime settings."
                )
            BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE ->
                BiometricAvailability.Unavailable("This device has no biometric hardware.")
            BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE ->
                BiometricAvailability.Unavailable("Biometric hardware is currently unavailable. Try again shortly.")
            BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED ->
                BiometricAvailability.Unavailable("A security update is required before app lock can be used.")
            else -> BiometricAvailability.Unavailable("Device authentication is not available right now.")
        }

    fun authenticate() {
        val promptInfo =
            BiometricPrompt.PromptInfo.Builder()
                .setTitle("Unlock Worktime")
                .setSubtitle("Confirm it's you to continue")
                .setAllowedAuthenticators(allowedAuthenticators)
                .build()

        val cipher = runCatching { getOrCreateAuthenticationCipher() }.getOrNull()
        if (cipher == null) {
            onError("Secure authentication is unavailable on this device.")
            return
        }
        prompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
    }

    private fun getOrCreateAuthenticationCipher(): Cipher {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        val key = (keyStore.getKey(KEY_ALIAS, null) as? SecretKey) ?: generateKey()
        try {
            cipher.init(Cipher.ENCRYPT_MODE, key)
        } catch (_: KeyPermanentlyInvalidatedException) {
            keyStore.deleteEntry(KEY_ALIAS)
            cipher.init(Cipher.ENCRYPT_MODE, generateKey())
        }
        return cipher
    }

    private fun generateKey(): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        val spec =
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    private companion object {
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        const val KEY_ALIAS = "worktime_biometric_gate_key"
        const val TRANSFORMATION =
            "${KeyProperties.KEY_ALGORITHM_AES}/${KeyProperties.BLOCK_MODE_GCM}/${KeyProperties.ENCRYPTION_PADDING_NONE}"
    }
}
