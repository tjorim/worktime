package com.worktime.buildlogic

/**
 * Build-time certificate-pinning helpers, extracted from app/build.gradle.kts so
 * they can be unit tested (script-local functions in a Kotlin DSL build script
 * cannot be). Runtime application of the resolved pins/hosts still lives in
 * CertificatePinnerProvider — this object only validates the gradle-property
 * inputs (WORKTIME_ANDROID_PROD_CERTIFICATE_PIN_HOSTS / _PINS) before they are
 * baked into BuildConfig.
 */
object CertPinning {
    fun splitCsv(value: String): List<String> =
        value.split(",").map { it.trim() }.filter { it.isNotEmpty() }

    private val base64Regex = Regex("^[A-Za-z0-9+/_-]+={0,2}$")

    // OkHttp's CertificatePinner requires the base64-decoded hash to be
    // exactly 32 bytes for sha256 or 20 bytes for sha1; a pin that merely has
    // the right prefix but a malformed hash would otherwise fail at runtime
    // instead of at build time.
    fun requireValidPinFormats(pins: List<String>) {
        val invalidPins =
            pins.filter { pin ->
                val parts = pin.split('/', limit = 2)
                if (parts.size != 2) {
                    return@filter true
                }
                val (prefix, encoded) = parts
                if (!base64Regex.matches(encoded)) {
                    return@filter true
                }
                when (prefix) {
                    "sha256" -> encoded.length !in 43..44
                    "sha1" -> encoded.length !in 27..28
                    else -> true
                }
            }
        check(invalidPins.isEmpty()) {
            "Invalid pin format(s): $invalidPins. " +
                "Pins must start with 'sha256/' or 'sha1/' followed by a valid base64-encoded hash."
        }
    }

    // Pins configured without hosts (or vice versa) would silently disable
    // pinning at runtime (CertificatePinnerProvider falls back to
    // CertificatePinner.DEFAULT whenever either list is empty) — catch that
    // misconfiguration at build time instead.
    fun requireHostsConfiguredForPins(
        hosts: List<String>,
        pins: List<String>,
    ) {
        check(pins.isEmpty() || hosts.isNotEmpty()) {
            "Certificate pins are configured (WORKTIME_ANDROID_PROD_CERTIFICATE_PINS) but no hosts are set " +
                "via WORKTIME_ANDROID_PROD_CERTIFICATE_PIN_HOSTS. Certificate pinning would be ineffective."
        }
        check(hosts.isEmpty() || pins.isNotEmpty()) {
            "Certificate pin hosts are configured (WORKTIME_ANDROID_PROD_CERTIFICATE_PIN_HOSTS) but no pins are " +
                "set via WORKTIME_ANDROID_PROD_CERTIFICATE_PINS. Certificate pinning would be ineffective."
        }
    }
}
