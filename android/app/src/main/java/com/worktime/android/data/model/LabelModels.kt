package com.worktime.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LabelMutationRequest(val name: String, val color: String)

@Serializable
data class LabelPatchRequest(val name: String? = null, val color: String? = null)

@Serializable
data class LabelRecord(
    val id: String,
    @SerialName("user_id") val userId: Int,
    val name: String,
    val color: String,
    @SerialName("created_at") val createdAt: String
)

@Serializable
data class LabelListResponse(val items: List<LabelRecord>, val total: Int)
