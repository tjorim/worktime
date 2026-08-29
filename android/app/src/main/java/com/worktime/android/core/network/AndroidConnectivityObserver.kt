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
 * The registered [NetworkRequest] isn't tied to one network, so a device can have more than one
 * network satisfying it (e.g. Wi-Fi and cellular both up during a handoff). Rather than re-querying
 * [ConnectivityManager] state from inside the callback -- which Android's own docs warn can race
 * with the callback delivery and return stale data -- each callback's own [NetworkCapabilities] are
 * tracked per [Network] in [validatedNetworks], and status is "online" whenever that set is
 * non-empty. That way losing one network doesn't report "offline" while another validated network
 * is still up, without ever reading back through [ConnectivityManager] inside a callback.
 */
class AndroidConnectivityObserver(context: Context) : ConnectivityObserver {
    private val connectivityManager =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override val isOnline: Flow<Boolean> =
        callbackFlow {
            val validatedNetworks = mutableSetOf<Network>()

            val callback =
                object : ConnectivityManager.NetworkCallback() {
                    override fun onLost(network: Network) {
                        validatedNetworks.remove(network)
                        trySend(validatedNetworks.isNotEmpty())
                    }

                    override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                        if (networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) {
                            validatedNetworks.add(network)
                        } else {
                            validatedNetworks.remove(network)
                        }
                        trySend(validatedNetworks.isNotEmpty())
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
