package com.securelearn.app.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.userPrefsDataStore: DataStore<Preferences> by
preferencesDataStore(name = "securelearn_prefs")

/**
 * Non-sensitive app preferences (DataStore). Security feature flags come
 * from the backend `/settings` endpoint; if the fetch fails the app
 * defaults to the most secure posture (protections ON).
 */
@Singleton
class UserPrefs @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    val screenshotProtection: Flow<Boolean> = context.userPrefsDataStore.data
        .map { it[KEY_SCREENSHOT] ?: true }

    val recordingProtection: Flow<Boolean> = context.userPrefsDataStore.data
        .map { it[KEY_RECORDING] ?: true }

    val watermarkEnabled: Flow<Boolean> = context.userPrefsDataStore.data
        .map { it[KEY_WATERMARK] ?: true }

    /**
     * Stage 7: block logins from rooted devices. Default true (most secure)
     * when the fetch fails or the key is absent.
     */
    val rootBlockEnabled: Flow<Boolean> = context.userPrefsDataStore.data
        .map { it[KEY_ROOT_BLOCK] ?: true }

    /**
     * Stage 7: Play Integrity enforcement mode ("off" | "log" | "block").
     * Server-side default is "log"; unknown values fall back to "log".
     */
    val integrityEnforcement: Flow<String> = context.userPrefsDataStore.data
        .map { it[KEY_INTEGRITY] ?: "log" }

    suspend fun saveFlags(screenshot: Boolean, recording: Boolean, watermark: Boolean) {
        context.userPrefsDataStore.edit {
            it[KEY_SCREENSHOT] = screenshot
            it[KEY_RECORDING] = recording
            it[KEY_WATERMARK] = watermark
        }
    }

    suspend fun saveSecurityFlags(rootBlock: Boolean, integrity: String) {
        context.userPrefsDataStore.edit {
            it[KEY_ROOT_BLOCK] = rootBlock
            it[KEY_INTEGRITY] = integrity
        }
    }

    companion object {
        private val KEY_SCREENSHOT = booleanPreferencesKey("screenshot_protection")
        private val KEY_RECORDING = booleanPreferencesKey("recording_protection")
        private val KEY_WATERMARK = booleanPreferencesKey("watermark_enabled")
        private val KEY_ROOT_BLOCK = booleanPreferencesKey("root_block_enabled")
        private val KEY_INTEGRITY = stringPreferencesKey("integrity_enforcement")
    }
}
