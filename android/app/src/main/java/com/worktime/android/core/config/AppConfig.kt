package com.worktime.android.core.config

import com.worktime.android.BuildConfig

data class AppConfig(val environment: String, val apiBaseUrl: String, val certificatePinHost: String, val certificatePins: List<String>)

fun buildAppConfig(): AppConfig = AppConfig(
    environment = BuildConfig.WORKTIME_ENVIRONMENT,
    apiBaseUrl = BuildConfig.API_BASE_URL,
    certificatePinHost = BuildConfig.CERTIFICATE_PIN_HOST,
    certificatePins = BuildConfig.CERTIFICATE_PINS.toCsvList()
)

private fun String.toCsvList(): List<String> = split(",")
    .map { it.trim() }
    .filter { it.isNotEmpty() }
