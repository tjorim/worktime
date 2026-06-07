package com.worktime.android.core.network

import com.worktime.android.core.config.AppConfig
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class CertificatePinnerProviderTest {
    @Test
    fun disablesPinningOutsideProduction() {
        val pinner = CertificatePinnerProvider.fromConfig(appConfig(environment = "dev"))

        assertNull(pinner)
    }

    @Test
    fun createsPinnerForProductionPins() {
        val pinner = CertificatePinnerProvider.fromConfig(appConfig(environment = "prod"))

        assertNotNull(pinner)
    }

    @Test
    fun disablesProductionPinningWhenPinsAreEmpty() {
        val pinner =
            CertificatePinnerProvider.fromConfig(
                appConfig(
                    environment = "prod",
                    certificatePins = emptyList()
                )
            )

        assertNull(pinner)
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
