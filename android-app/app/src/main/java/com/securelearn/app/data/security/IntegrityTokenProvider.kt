package com.securelearn.app.data.security

import android.content.Context
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.android.play.core.integrity.IntegrityTokenResponse
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

/**
 * Play Integrity token provider (Stage 7).
 *
 * Mints a one-time integrity token at login time; the backend decodes it via
 * Google's Play Integrity API when the admin enables enforcement.
 *
 * This NEVER hard-fails: no Play Services (emulator, de-Googled device),
 * no network, or an API error all yield `null`, and the login proceeds
 * without a token. In that case the server can only enforce what it can see
 * (the RootBeer self-report) — full enforcement requires a Play-distributed
 * build, which is documented in DEPLOYMENT.md.
 */
@Singleton
class IntegrityTokenProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    suspend fun getToken(): String? {
        return try {
            val manager = IntegrityManagerFactory.create(context)
            // Fresh random nonce per request; binds this token to this login
            // attempt so it can't be replayed elsewhere.
            val nonce = UUID.randomUUID().toString() + "-" + System.currentTimeMillis()
            val request = IntegrityTokenRequest.builder()
                .setNonce(nonce)
                .build()
            val response: IntegrityTokenResponse? = suspendCancellableCoroutine { cont ->
                manager.requestIntegrityToken(request)
                    .addOnSuccessListener { r -> cont.resume(r) }
                    .addOnFailureListener { cont.resume(null) }
            }
            response?.token()
        } catch (_: Exception) {
            null
        }
    }
}
