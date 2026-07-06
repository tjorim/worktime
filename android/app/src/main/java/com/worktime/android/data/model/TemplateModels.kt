package com.worktime.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TemplateMutationRequest(
    val text: String,
    @SerialName("label_id") val labelId: String? = null,
    @SerialName("start_time") val startTime: String,
    @SerialName("stop_time") val stopTime: String
)

@Serializable
data class TemplatePatchRequest(
    val text: String? = null,
    @SerialName("label_id") val labelId: String? = null,
    @SerialName("start_time") val startTime: String? = null,
    @SerialName("stop_time") val stopTime: String? = null
)

@Serializable
data class TemplateRecord(
    val id: String,
    @SerialName("user_id") val userId: Int,
    @SerialName("label_id") val labelId: String? = null,
    val text: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("stop_time") val stopTime: String,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class TemplateListResponse(val items: List<TemplateRecord>, val total: Int)
