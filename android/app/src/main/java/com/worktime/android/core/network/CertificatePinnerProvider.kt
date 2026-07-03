package com.worktime.android.core.network

import com.worktime.android.core.config.AppConfig
import okhttp3.CertificatePinner

object CertificatePinnerProvider {
    fun fromConfig(appConfig: AppConfig): CertificatePinner {
        if (appConfig.environment != "prod") return CertificatePinner.DEFAULT
        if (appConfig.certificatePinHost.isEmpty() || appConfig.certificatePins.isEmpty()) return CertificatePinner.DEFAULT

        return CertificatePinner
            .Builder()
            .apply {
                appConfig.certificatePins.forEach { pin ->
                    add(appConfig.certificatePinHost, pin)
                }
            }.build()
    }
}
