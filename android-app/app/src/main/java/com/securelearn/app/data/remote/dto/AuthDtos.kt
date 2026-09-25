package com.securelearn.app.data.remote.dto

/** Mirrors backend auth DTOs exactly (camelCase JSON). */
data class OtpRequest(val phone: String)

data class OtpRequestResponse(
    val message: String,
    val expiresInSec: Int,
)

data class OtpVerify(
    val phone: String,
    val otp: String,
    val deviceFingerprint: String,
    val deviceName: String?,
    val name: String? = null,
    /** Play Integrity token; null when unavailable (never blocks the call). */
    val integrityToken: String? = null,
    /** Honest RootBeer self-report; server treats it as a signal, not proof. */
    val rooted: Boolean? = null,
)

data class RegisterRequest(
    val name: String,
    val email: String?,
    val phone: String,
    val password: String?,
    val deviceFingerprint: String,
    val deviceName: String?,
    val integrityToken: String? = null,
    val rooted: Boolean? = null,
)

data class LoginRequest(
    val email: String,
    val password: String,
    val deviceFingerprint: String,
    val deviceName: String?,
    val integrityToken: String? = null,
    val rooted: Boolean? = null,
)

data class RefreshRequest(val refreshToken: String)

data class TokenPairDto(
    val accessToken: String,
    val refreshToken: String,
    val refreshExpiresAt: String,
)

data class UserDto(
    val id: String,
    val name: String,
    val email: String?,
    val phone: String,
    val status: String,
    val maxDevices: Int,
    val accessExpiresAt: String?,
)

data class AuthResponse(
    val accessToken: String,
    val refreshToken: String,
    val refreshExpiresAt: String,
    val user: UserDto,
)

data class MessageResponse(val message: String)
