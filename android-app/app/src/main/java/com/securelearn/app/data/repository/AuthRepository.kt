package com.securelearn.app.data.repository

import android.os.Build
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.remote.ApiService
import com.securelearn.app.data.remote.dto.LoginRequest
import com.securelearn.app.data.remote.dto.OtpRequest
import com.securelearn.app.data.remote.dto.OtpVerify
import com.securelearn.app.data.remote.dto.RefreshRequest
import com.securelearn.app.data.remote.dto.RegisterRequest
import com.securelearn.app.data.remote.dto.UserDto
import com.securelearn.app.data.security.IntegrityTokenProvider
import com.securelearn.app.data.security.RootDetector
import javax.inject.Singleton

/**
 * Auth flows. Uses the *plain* ApiService (no Bearer token needed for these
 * calls) and persists the resulting session in encrypted storage.
 *
 * Stage 7: every login-ish call carries an optional Play Integrity token
 * (null when Play Services is unavailable — never blocks the call) and an
 * honest RootBeer self-report. The server is the authoritative enforcer.
 */
@Singleton
class AuthRepository constructor(
    private val api: ApiService, // plain client binding
    private val sessionManager: SessionManager,
    private val integrityTokenProvider: IntegrityTokenProvider,
    private val rootDetector: RootDetector,
) {
    private fun deviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}".trim()

    suspend fun requestOtp(phone: String) =
        api.requestOtp(OtpRequest(phone))

    suspend fun verifyOtp(phone: String, otp: String, name: String? = null): UserDto {
        val res = api.verifyOtp(
            OtpVerify(
                phone = phone,
                otp = otp,
                deviceFingerprint = sessionManager.deviceFingerprint(),
                deviceName = deviceName(),
                name = name,
                integrityToken = integrityTokenProvider.getToken(),
                rooted = rootDetector.isRooted().takeIf { it },
            ),
        )
        sessionManager.saveSession(res.accessToken, res.refreshToken, res.user)
        return res.user
    }

    suspend fun register(
        name: String,
        phone: String,
        email: String?,
        password: String?,
    ): UserDto {
        val res = api.register(
            RegisterRequest(
                name = name,
                email = email?.ifBlank { null },
                phone = phone,
                password = password?.ifBlank { null },
                deviceFingerprint = sessionManager.deviceFingerprint(),
                deviceName = deviceName(),
                integrityToken = integrityTokenProvider.getToken(),
                rooted = rootDetector.isRooted().takeIf { it },
            ),
        )
        sessionManager.saveSession(res.accessToken, res.refreshToken, res.user)
        return res.user
    }

    suspend fun login(email: String, password: String): UserDto {
        val res = api.login(
            LoginRequest(
                email = email,
                password = password,
                deviceFingerprint = sessionManager.deviceFingerprint(),
                deviceName = deviceName(),
                integrityToken = integrityTokenProvider.getToken(),
                rooted = rootDetector.isRooted().takeIf { it },
            ),
        )
        sessionManager.saveSession(res.accessToken, res.refreshToken, res.user)
        return res.user
    }

    suspend fun logout() {
        val refresh = sessionManager.refreshTokenSync()
        try {
            if (!refresh.isNullOrBlank()) api.logout(RefreshRequest(refresh))
        } catch (_: Exception) {
            // Best effort — local session is wiped regardless.
        } finally {
            sessionManager.clearSession()
        }
    }
}
