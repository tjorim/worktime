package com.worktime.android.core.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.conflate
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * [ConnectivityObserver] backed by [ConnectivityManager.registerNetworkCallback]. A network only
 * counts as "online" once [NetworkCapabilities.NET_CAPABILITY_VALIDATED] is set -- captive portals
 * and DNS-black-holed connections report [android.net.ConnectivityManager.NetworkCallback.onAvailable]
 * without actually reaching the backend, which would otherwise trigger a reconcile that just fails
 * again.
 *
 * The registered [NetworkRequest] isn't tied to one network, so a device with more than one network
 * satisfying it (e.g. Wi-Fi and cellular both up during a handoff) can deliver a callback for a
 * network that isn't the one the OS is actually routing through. Each callback therefore recomputes
 * device-wide status from [ConnectivityManager.getActiveNetwork] instead of trusting the specific
 * [Network]/[NetworkCapabilities] the callback was invoked with -- otherwise losing the non-default
 * network (or its capabilities settling after being deprioritized) could report "offline" while the
 * device is still online through the other one.
 */
class AndroidConnectivityObserver(context: Context) : ConnectivityObserver {
    private val connectivityManager =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override val isOnline: Flow<Boolean> =
        callbackFlow {
            val callback =
                object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        trySend(currentlyOnline())
                    }

                    override fun onLost(network: Network) {
                        trySend(currentlyOnline())
                    }

                    override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                        trySend(currentlyOnline())
                    }
                }
            val request =
                NetworkRequest.Builder()
                    .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                    .build()
            trySend(currentlyOnline())
            connectivityManager.registerNetworkCallback(request, callback)
            awaitClose { connectivityManager.unregisterNetworkCallback(callback) }
        }.distinctUntilChanged().conflate()

    private fun currentlyOnline(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
