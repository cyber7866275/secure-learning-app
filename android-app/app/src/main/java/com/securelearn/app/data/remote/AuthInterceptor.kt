package com.securelearn.app.data.remote

import com.securelearn.app.data.local.SessionManager
import javax.inject.Inject
import okhttp3.Interceptor
import okhttp3.Response

/** Adds `Authorization: Bearer <accessToken>` to every request when logged in. */
class AuthInterceptor @Inject constructor(
    private val sessionManager: SessionManager,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val token = sessionManager.accessTokenSync()
        if (token.isNullOrBlank()) return chain.proceed(request)
        return chain.proceed(
            request.newBuilder()
                .header("Authorization", "Bearer $token")
                .build(),
        )
    }
}
