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
 */
class AndroidConnectivityObserver(context: Context) : ConnectivityObserver {
    private val connectivityManager =
        context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    override val isOnline: Flow<Boolean> =
        callbackFlow {
            val callback =
                object : ConnectivityManager.NetworkCallback() {
                    override fun onAvailable(network: Network) {
                        trySend(isValidated(network))
                    }

                    override fun onLost(network: Network) {
                        trySend(false)
                    }

                    override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
                        trySend(networkCapabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED))
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

    private fun isValidated(network: Network): Boolean {
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    private fun currentlyOnline(): Boolean {
        val network = connectivityManager.activeNetwork ?: return false
        return isValidated(network)
    }
}
