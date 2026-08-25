package com.worktime.android.data.model

import kotlinx.serialization.Serializable

@Serializable
data class FcmTokenRequest(val token: String)

@Serializable
data class FcmTokenResponse(val id: String)
