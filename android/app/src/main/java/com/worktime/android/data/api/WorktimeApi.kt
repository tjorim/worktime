package com.worktime.android.data.api

import com.jakewharton.retrofit2.converter.kotlinx.serialization.asConverterFactory
import com.worktime.android.core.network.DynamicBaseUrlInterceptor
import com.worktime.android.data.model.DashboardResponse
import com.worktime.android.data.model.FcmTokenRequest
import com.worktime.android.data.model.FcmTokenResponse
import com.worktime.android.data.model.LabelListResponse
import com.worktime.android.data.model.LabelMutationRequest
import com.worktime.android.data.model.LabelRecord
import com.worktime.android.data.model.SyncStatusResponse
import com.worktime.android.data.model.TaskListResponse
import com.worktime.android.data.model.TaskMutationRequest
import com.worktime.android.data.model.TaskRecord
import com.worktime.android.data.model.TemplateListResponse
import com.worktime.android.data.model.UserPreferencesRead
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
import retrofit2.http.Headers
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

@Suppress("TooManyFunctions") // one cohesive Retrofit client for the whole backend surface
interface WorktimeApi {
    @GET("api/read-models/dashboard")
    suspend fun getDashboard(
        @Header("Authorization") authorization: String,
        @Query("timezone") timezone: String
    ): DashboardResponse

    @POST("api/time-tracking/tasks")
    suspend fun createTask(
        @Header("Authorization") authorization: String,
        @Body payload: TaskMutationRequest
    ): TaskRecord

    @PATCH("api/time-tracking/tasks/{taskId}")
    suspend fun updateTask(
        @Header("Authorization") authorization: String,
        @Path("taskId") taskId: String,
        @Body payload: TaskMutationRequest
    ): TaskRecord

    @GET("api/time-tracking/tasks/running")
    suspend fun getRunningTask(@Header("Authorization") authorization: String): Response<TaskRecord>

    @PUT("api/work-locations/{valueDate}")
    suspend fun upsertWorkLocation(
        @Header("Authorization") authorization: String,
        @Path("valueDate") valueDate: String,
        @Body payload: WorkLocationMutationRequest
    ): WorkLocationRecord

    @GET("api/work-locations")
    suspend fun listWorkLocations(
        @Header("Authorization") authorization: String,
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null
    ): WorkLocationListResponse

    @GET("api/sync/status")
    suspend fun getSyncStatus(@Header("Authorization") authorization: String): SyncStatusResponse

    @Headers("Prefer: return=minimal")
    @GET("api/preferences")
    suspend fun getPreferences(@Header("Authorization") authorization: String): Response<UserPreferencesRead?>

    // Push-wake registration (#1205) -- resolved from the bearer token only, no user_id query param.
    @POST("api/push/fcm-token")
    suspend fun registerFcmToken(
        @Header("Authorization") authorization: String,
        @Body payload: FcmTokenRequest
    ): FcmTokenResponse

    @DELETE("api/push/fcm-token")
    suspend fun unregisterFcmToken(@Header("Authorization") authorization: String, @Query("token") token: String)

    @POST("api/labels")
    suspend fun createLabel(
        @Header("Authorization") authorization: String,
        @Body payload: LabelMutationRequest
    ): LabelRecord

    @GET("api/labels")
    suspend fun listLabels(@Header("Authorization") authorization: String): LabelListResponse

    @GET("api/time-tracking/templates")
    suspend fun listTemplates(@Header("Authorization") authorization: String): TemplateListResponse

    @GET("api/time-tracking/tasks")
    suspend fun listTasks(
        @Header("Authorization") authorization: String,
        @Query("start_date") startDate: String? = null,
        @Query("end_date") endDate: String? = null
    ): TaskListResponse

    @DELETE("api/time-tracking/tasks/{taskId}")
    suspend fun deleteTask(@Header("Authorization") authorization: String, @Path("taskId") taskId: String)

    @GET("api/work-locations/{valueDate}")
    suspend fun getWorkLocation(
        @Header("Authorization") authorization: String,
        @Path("valueDate") valueDate: String
    ): Response<WorkLocationRecord>

    @DELETE("api/work-locations/{valueDate}")
    suspend fun deleteWorkLocation(@Header("Authorization") authorization: String, @Path("valueDate") valueDate: String)

    companion object {
        fun create(
            baseUrl: String,
            enableNetworkLogging: Boolean,
            certificatePinner: CertificatePinner = CertificatePinner.DEFAULT,
            baseUrlOverrideProvider: (() -> String?)? = null
        ): WorktimeApi {
            val json =
                Json {
                    ignoreUnknownKeys = true
                    explicitNulls = false
                }
            val builder = OkHttpClient.Builder()
            builder.certificatePinner(certificatePinner)
            if (baseUrlOverrideProvider != null) {
                builder.addInterceptor(DynamicBaseUrlInterceptor(baseUrlOverrideProvider))
            }
            if (enableNetworkLogging) {
                builder.addInterceptor(
                    HttpLoggingInterceptor().apply {
                        level = HttpLoggingInterceptor.Level.BASIC
                    }
                )
            }
            val client = builder.build()
            val normalizedBaseUrl = if (baseUrl.endsWith("/")) baseUrl else "$baseUrl/"

            return Retrofit
                .Builder()
                .baseUrl(normalizedBaseUrl)
                .client(client)
                .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
                .build()
                .create(WorktimeApi::class.java)
        }
    }
}
