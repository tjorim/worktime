package com.worktime.android.core.network

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.emptyFlow

/** Reports validated internet-capable connectivity so callers can reconcile once it returns. */
interface ConnectivityObserver {
    /** Emits the device's current online/offline status, then again on every change. */
    val isOnline: Flow<Boolean>

    companion object {
        /** No-op observer for call sites (tests, previews) that don't need connectivity awareness. */
        val Disabled: ConnectivityObserver = object : ConnectivityObserver {
            override val isOnline: Flow<Boolean> = emptyFlow()
        }
    }
}
