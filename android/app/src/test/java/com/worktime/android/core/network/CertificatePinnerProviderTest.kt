package com.worktime.android.core.network

import com.worktime.android.core.config.AppConfig
import okhttp3.CertificatePinner
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class CertificatePinnerProviderTest {
    @Test
    fun fallsBackToDefaultVerificationOutsideProduction() {
        val pinner = CertificatePinnerProvider.fromConfig(appConfig(environment = "dev"))

        assertEquals(CertificatePinner.DEFAULT, pinner)
    }

    @Test
    fun createsPinnerForProductionPins() {
        val pinner = CertificatePinnerProvider.fromConfig(appConfig(environment = "prod"))

        assertNotEquals(CertificatePinner.DEFAULT, pinner)
    }

    @Test
    fun fallsBackToDefaultVerificationWhenProductionPinsAreEmpty() {
        val pinner =
            CertificatePinnerProvider.fromConfig(
                appConfig(
                    environment = "prod",
                    certificatePins = emptyList()
                )
            )

        assertEquals(CertificatePinner.DEFAULT, pinner)
    }

    private fun appConfig(environment: String, certificatePins: List<String> = listOf("sha256/YLh1dUR9y6Kja30RrAn7JKnbQG/uEtLMkBgFF2Fuihg=")): AppConfig =
        AppConfig(
            environment = environment,
            apiBaseUrl = "https://worktime.tjor.im/",
            oidcAuthority = "https://auth.tjor.im/realms/worktime",
            oidcClientId = "worktime",
            oidcScope = "openid profile email offline_access",
            oidcRedirectUri = "com.worktime.android:/oauth2redirect",
            certificatePinHosts = listOf("worktime.tjor.im", "auth.tjor.im"),
            certificatePins = certificatePins
        )
}
