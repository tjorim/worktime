package com.worktime.buildlogic

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CertPinningTest {
    // ── splitCsv ─────────────────────────────────────────────────────────────

    @Test
    fun `splitCsv splits on commas, trims whitespace, and drops blank entries`() {
        val hosts = CertPinning.splitCsv(" worktime.tjor.im , auth.tjor.im ,, ")

        assertEquals(listOf("worktime.tjor.im", "auth.tjor.im"), hosts)
    }

    @Test
    fun `splitCsv returns an empty list for a blank string`() {
        assertEquals(emptyList<String>(), CertPinning.splitCsv(""))
    }

    // ── requireValidPinFormats ───────────────────────────────────────────────

    // 44-char base64 (32 zero bytes) and 28-char base64 (20 zero bytes) — the
    // exact lengths OkHttp's CertificatePinner expects for sha256/sha1 hashes.
    private val validSha256Pin = "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    private val validSha1Pin = "sha1/AAAAAAAAAAAAAAAAAAAAAAAAAAA="

    @Test
    fun `requireValidPinFormats accepts sha256 and sha1 pins`() {
        CertPinning.requireValidPinFormats(listOf(validSha256Pin, validSha1Pin))
    }

    @Test
    fun `requireValidPinFormats accepts an empty pin list`() {
        CertPinning.requireValidPinFormats(emptyList())
    }

    @Test
    fun `requireValidPinFormats rejects pins without a sha256 or sha1 prefix`() {
        val exception =
            assertThrows(IllegalStateException::class.java) {
                CertPinning.requireValidPinFormats(listOf(validSha256Pin, "md5/AAAAAAAAAAAAAAAAAAAAAAAAAAA="))
            }
        assertTrue(exception.message.orEmpty().contains("md5/AAAAAAAAAAAAAAAAAAAAAAAAAAA="))
    }

    @Test
    fun `requireValidPinFormats rejects a bare digest without a prefix`() {
        assertThrows(IllegalStateException::class.java) {
            CertPinning.requireValidPinFormats(listOf("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="))
        }
    }

    @Test
    fun `requireValidPinFormats rejects a pin with the wrong decoded length`() {
        val exception =
            assertThrows(IllegalStateException::class.java) {
                CertPinning.requireValidPinFormats(listOf("sha256/too-short"))
            }
        assertTrue(exception.message.orEmpty().contains("sha256/too-short"))
    }

    @Test
    fun `requireValidPinFormats rejects a pin with non-base64 characters`() {
        assertThrows(IllegalStateException::class.java) {
            CertPinning.requireValidPinFormats(listOf("sha256/not valid base64!!"))
        }
    }

    @Test
    fun `requireValidPinFormats rejects an empty hash after the prefix`() {
        assertThrows(IllegalStateException::class.java) {
            CertPinning.requireValidPinFormats(listOf("sha256/"))
        }
    }

    // ── requireHostsConfiguredForPins ────────────────────────────────────────

    @Test
    fun `requireHostsConfiguredForPins accepts matching hosts and pins`() {
        CertPinning.requireHostsConfiguredForPins(
            hosts = listOf("worktime.tjor.im"),
            pins = listOf("sha256/abc"),
        )
    }

    @Test
    fun `requireHostsConfiguredForPins accepts both empty`() {
        CertPinning.requireHostsConfiguredForPins(hosts = emptyList(), pins = emptyList())
    }

    @Test
    fun `requireHostsConfiguredForPins fails when pins are configured but hosts are empty`() {
        val exception =
            assertThrows(IllegalStateException::class.java) {
                CertPinning.requireHostsConfiguredForPins(hosts = emptyList(), pins = listOf("sha256/abc"))
            }
        assertTrue(exception.message.orEmpty().contains("WORKTIME_ANDROID_PROD_CERTIFICATE_PIN_HOSTS"))
    }

    @Test
    fun `requireHostsConfiguredForPins fails when hosts are configured but pins are empty`() {
        val exception =
            assertThrows(IllegalStateException::class.java) {
                CertPinning.requireHostsConfiguredForPins(hosts = listOf("worktime.tjor.im"), pins = emptyList())
            }
        assertTrue(exception.message.orEmpty().contains("WORKTIME_ANDROID_PROD_CERTIFICATE_PINS"))
    }
}
