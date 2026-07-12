package com.worktime.android.core.auth

import android.content.Context
import androidx.annotation.StringRes
import com.worktime.android.R
import net.openid.appauth.AuthorizationException

internal object AuthErrorMessages {
    fun authorizationResponseError(context: Context, exception: AuthorizationException?): String =
        context.getString(messageRes(exception, R.string.auth_error_sign_in_cancelled))

    fun tokenExchangeError(context: Context, exception: AuthorizationException?): String =
        context.getString(messageRes(exception, R.string.auth_error_token_exchange_failed))

    fun startSignInError(context: Context): String = context.getString(R.string.auth_error_start_sign_in)

    fun completeSignInError(context: Context): String = context.getString(R.string.auth_error_complete_sign_in)

    @StringRes
    private fun messageRes(exception: AuthorizationException?, @StringRes fallback: Int): Int {
        if (exception == null) return fallback
        return when {
            hasSameCategory(exception, AuthorizationException.GeneralErrors.NETWORK_ERROR) ->
                R.string.auth_error_network

            hasSameCategory(exception, AuthorizationException.GeneralErrors.SERVER_ERROR) ->
                R.string.auth_error_provider_unavailable

            hasSameCategory(exception, AuthorizationException.GeneralErrors.USER_CANCELED_AUTH_FLOW) ->
                R.string.auth_error_sign_in_cancelled

            exception.type == AuthorizationException.TYPE_OAUTH_AUTHORIZATION_ERROR &&
                exception.error == "access_denied" -> R.string.auth_error_access_denied

            exception.type == AuthorizationException.TYPE_OAUTH_AUTHORIZATION_ERROR ->
                R.string.auth_error_authorization_failed

            exception.type == AuthorizationException.TYPE_OAUTH_TOKEN_ERROR ->
                R.string.auth_error_token_exchange_failed

            else -> fallback
        }
    }

    private fun hasSameCategory(actual: AuthorizationException, expected: AuthorizationException): Boolean =
        actual.type == expected.type && actual.code == expected.code
}
