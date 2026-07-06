package com.worktime.android.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
data class TimeOffEntryMutationRequest(
    @SerialName("entry_id") val entryId: String? = null,
    @SerialName("entry_kind") val entryKind: String = "date",
    val date: String? = null,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    val weekday: Int? = null,
    @SerialName("entry_type") val entryType: String = "vacation",
    @SerialName("entry_flag") val entryFlag: String = "full_day",
    val note: String? = null
)

@Serializable
data class TimeOffEntryPatchRequest(
    @SerialName("entry_kind") val entryKind: String? = null,
    val date: String? = null,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    val weekday: Int? = null,
    @SerialName("entry_type") val entryType: String? = null,
    @SerialName("entry_flag") val entryFlag: String? = null,
    val note: JsonElement? = null
)

@Serializable
data class TimeOffEntryRecord(
    val id: Int,
    @SerialName("entry_id") val entryId: String,
    @SerialName("user_id") val userId: Int,
    @SerialName("entry_kind") val entryKind: String,
    val date: String? = null,
    @SerialName("start_date") val startDate: String? = null,
    @SerialName("end_date") val endDate: String? = null,
    val weekday: Int? = null,
    @SerialName("entry_type") val entryType: String,
    @SerialName("entry_flag") val entryFlag: String,
    val note: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String
)

@Serializable
data class TimeOffEntryListResponse(val items: List<TimeOffEntryRecord>, val total: Int)
