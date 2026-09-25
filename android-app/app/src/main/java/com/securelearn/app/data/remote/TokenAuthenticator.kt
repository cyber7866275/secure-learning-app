package com.securelearn.app.data.remote

import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.remote.dto.RefreshRequest
import com.securelearn.app.di.PlainClient
import javax.inject.Inject
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route

/**
 * Single-flight 401 handler: refreshes the token pair once, retries the
 * failed request. If refresh fails (expired / revoked / reuse detected),
 * the session is wiped and the app navigates back to Login.
 *
 * Uses the *plain* (non-authenticated) ApiService to avoid interceptor loops.
 */
class TokenAuthenticator @Inject constructor(
    private val sessionManager: SessionManager,
    @PlainClient private val plainApi: ApiService,
) : Authenticator {

    override fun authenticate(route: Route?, response: Response): Request? {
        if (responseCount(response) >= 2) return null // don't loop forever

        synchronized(this) {
            val failedAuth = response.request.header("Authorization")
            val current = sessionManager.accessTokenSync()

            // Another thread already refreshed while we waited — just retry.
            if (!current.isNullOrBlank() && "Bearer $current" != failedAuth) {
                return response.request.newBuilder()
                    .header("Authorization", "Bearer $current")
                    .build()
            }

            val refreshToken = sessionManager.refreshTokenSync()
                ?: run {
                    runBlocking { sessionManager.clearSession() }
                    return null
                }

            return try {
                val pair = runBlocking { plainApi.refresh(RefreshRequest(refreshToken)) }
                runBlocking { sessionManager.updateTokens(pair.accessToken, pair.refreshToken) }
                response.request.newBuilder()
                    .header("Authorization", "Bearer ${pair.accessToken}")
                    .build()
            } catch (e: Exception) {
                // Refresh rejected (expired, revoked, or reuse detected) → force logout.
                runBlocking { sessionManager.clearSession() }
                null
            }
        }
    }

    private fun responseCount(response: Response): Int {
        var result = 1
        var prior = response.priorResponse
        while (prior != null) {
            result++
            prior = prior.priorResponse
        }
        return result
    }
}
