package com.worktime.android.data.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.worktime.android.data.model.DashboardResponse
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Query

interface WorktimeApi {
    @GET("api/read-models/dashboard")
    suspend fun getDashboard(
        @Header("Authorization") authorization: String,
        @Query("timezone") timezone: String,
    ): DashboardResponse

    companion object {
        fun create(baseUrl: String, enableNetworkLogging: Boolean): WorktimeApi {
            val json = Json {
                ignoreUnknownKeys = true
                explicitNulls = false
            }
            val client = OkHttpClient.Builder().apply {
                if (enableNetworkLogging) {
                    addInterceptor(
                        HttpLoggingInterceptor().apply {
                            level = HttpLoggingInterceptor.Level.BASIC
                        },
                    )
                }
            }.build()

            return Retrofit.Builder()
                .baseUrl(baseUrl)
                .client(client)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(WorktimeApi::class.java)
        }
    }
}
