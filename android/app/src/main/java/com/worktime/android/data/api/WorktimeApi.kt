package com.worktime.android.data.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.WorkLocationListResponse
import com.worktime.android.data.model.WorkLocationMutationRequest
import com.worktime.android.data.model.WorkLocationRecord
import kotlinx.serialization.json.Json
import okhttp3.CertificatePinner
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface WorktimeApi {
    @GET("api/read-models/dashboard")
    suspend fun getDashboard(@Header("Authorization") authorization: String, @Query("timezone") timezone: String): DashboardResponse

    @POST("api/time-tracking/tasks")
    suspend fun createTask(@Header("Authorization") authorization: String, @Query("user_id") userId: Int, @Body payload: TaskMutationRequest): TaskRecord

    @PUT("api/time-tracking/tasks/{taskId}")
    suspend fun updateTask(
        @Header("Authorization") authorization: String,
        @Path("taskId") taskId: String,
        @Query("user_id") userId: Int,
        @Body payload: TaskMutationRequest
    ): TaskRecord

    @GET("api/time-tracking/tasks/running")
    suspend fun getRunningTask(@Header("Authorization") authorization: String, @Query("user_id") userId: Int): Response<TaskRecord>

    @POST("api/work-locations/")
    suspend fun upsertWorkLocation(
        @Header("Authorization") authorization: String,
        @Query("user_id") userId: Int,
        @Body payload: WorkLocationMutationRequest
    ): WorkLocationRecord

    @GET("api/work-locations/")
    suspend fun listWorkLocations(
        @Header("Authorization") authorization: String,
        @Query("user_id") userId: Int,
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null
    ): WorkLocationListResponse

    @DELETE("api/time-tracking/labels/{labelId}")
    suspend fun deleteLabel(@Header("Authorization") authorization: String, @Path("labelId") labelId: String, @Query("user_id") userId: Int)

    @GET("api/sync/status")
    suspend fun getSyncStatus(@Header("Authorization") authorization: String): SyncStatusResponse

    companion object {
        fun create(baseUrl: String, enableNetworkLogging: Boolean, certificatePinner: CertificatePinner = CertificatePinner.DEFAULT): WorktimeApi {
            val json =
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                }
            val builder = OkHttpClient.Builder()
            builder.certificatePinner(certificatePinner)
            if (enableNetworkLogging) {
                builder.addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.BASIC
                    }
                )
            }
            val client = builder.build()

            return Retrofit
                .Builder()
                .baseUrl(baseUrl)
                .client(client)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(WorktimeApi::class.java)
        }
    }
}
