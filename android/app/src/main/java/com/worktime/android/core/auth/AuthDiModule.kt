package com.worktime.android.core.auth

import com.worktime.android.core.config.AppConfig
import com.worktime.android.core.config.buildAppConfig
import com.worktime.android.core.network.CertificatePinnerProvider
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import okhttp3.OkHttpClient

@Module
@InstallIn(SingletonComponent::class)
object AuthDiModule {
    @Provides
    @Singleton
    fun provideAppConfig(): AppConfig = buildAppConfig()

    @Provides
    @Singleton
    fun provideOidcConfig(): OidcConfig = buildOidcConfig()

    // Discovery returns the endpoints the whole auth flow trusts, so it must be
    // pinned exactly like the API client; a plain OkHttpClient would let a
    // MITM with a rogue CA swap in attacker-controlled authorization/token URLs.
    @Provides
    @Singleton
    fun provideOidcServiceConfigurationDiscovery(appConfig: AppConfig): OidcServiceConfigurationDiscovery =
        OidcServiceConfigurationDiscovery(
            OkHttpClient.Builder().certificatePinner(CertificatePinnerProvider.fromConfig(appConfig)).build()
        )
}
