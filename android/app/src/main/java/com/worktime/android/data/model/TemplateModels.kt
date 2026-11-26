package com.worktime.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TemplateRecord(
    val id: String,
    @SerialName("label_id") val labelId: String? = null,
    val text: String,
    @SerialName("start_time") val startTime: String,
    @SerialName("stop_time") val stopTime: String,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class TemplateListResponse(val items: List<TemplateRecord>, val total: Int)
