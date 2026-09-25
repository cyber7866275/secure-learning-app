package com.securelearn.app.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.securelearn.app.data.remote.dto.UserDto
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Encrypted at rest (AES-256 via AndroidKeyStore). Holds the token pair,
 * the cached user profile, and the stable device fingerprint.
 *
 * Sync getters are used on OkHttp background threads (interceptor /
 * authenticator); suspend setters run on the caller's coroutine.
 */
@Singleton
class SessionManager @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        "securelearn_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private val _isLoggedIn = MutableStateFlow(prefs.contains(KEY_ACCESS))
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    fun accessTokenSync(): String? = prefs.getString(KEY_ACCESS, null)
    fun refreshTokenSync(): String? = prefs.getString(KEY_REFRESH, null)

    fun userId(): String? = prefs.getString(KEY_USER_ID, null)
    fun userName(): String? = prefs.getString(KEY_USER_NAME, null)
    fun userPhone(): String? = prefs.getString(KEY_USER_PHONE, null)

    /**
     * Stable per-install device fingerprint, generated once. Sent as
     * `deviceFingerprint` on OTP verify / login / register so the backend
     * can enforce the per-user device limit.
     */
    fun deviceFingerprint(): String {
        prefs.getString(KEY_FINGERPRINT, null)?.let { return it }
        val fresh = UUID.randomUUID().toString()
        prefs.edit().putString(KEY_FINGERPRINT, fresh).apply()
        return fresh
    }

    suspend fun saveSession(accessToken: String, refreshToken: String, user: UserDto) {
        prefs.edit()
            .putString(KEY_ACCESS, accessToken)
            .putString(KEY_REFRESH, refreshToken)
            .putString(KEY_USER_ID, user.id)
            .putString(KEY_USER_NAME, user.name)
            .putString(KEY_USER_PHONE, user.phone)
            .apply()
        _isLoggedIn.value = true
    }

    suspend fun updateTokens(accessToken: String, refreshToken: String) {
        prefs.edit()
            .putString(KEY_ACCESS, accessToken)
            .putString(KEY_REFRESH, refreshToken)
            .apply()
        _isLoggedIn.value = true
    }

    suspend fun clearSession() {
        prefs.edit()
            .remove(KEY_ACCESS)
            .remove(KEY_REFRESH)
            .remove(KEY_USER_ID)
            .remove(KEY_USER_NAME)
            .remove(KEY_USER_PHONE)
            .apply()
        _isLoggedIn.value = false
    }

    companion object {
        private const val KEY_ACCESS = "access_token"
        private const val KEY_REFRESH = "refresh_token"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_USER_NAME = "user_name"
        private const val KEY_USER_PHONE = "user_phone"
        private const val KEY_FINGERPRINT = "device_fingerprint"
    }
}
