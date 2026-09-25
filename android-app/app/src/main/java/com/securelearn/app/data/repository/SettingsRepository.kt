package com.securelearn.app.data.repository

import com.securelearn.app.data.local.UserPrefs
import com.securelearn.app.data.remote.ApiService
import javax.inject.Singleton
import kotlinx.coroutines.flow.first

/**
 * Fetches the public feature flags (`GET /settings`) and caches them.
 * If the fetch fails, previously cached values (default: most secure)
 * are kept.
 */
@Singleton
class SettingsRepository constructor(
    private val api: ApiService, // plain client binding
    private val userPrefs: UserPrefs,
) {
    val screenshotProtection = userPrefs.screenshotProtection
    val watermarkEnabled = userPrefs.watermarkEnabled

    suspend fun refresh(): Result<Unit> = runCatching {
        val res = api.publicSettings()
        val s = res.settings
        userPrefs.saveFlags(
            screenshot = s["screenshot_protection"] != "false",
            recording = s["recording_protection"] != "false",
            watermark = s["watermark_enabled"] != "false",
        )
        // Stage 7: fail closed on the client too — a missing/unparseable
        // value keeps the most secure posture.
        val integrityRaw = s["integrity_enforcement"]
        val integrity =
            if (integrityRaw == "off" || integrityRaw == "log" || integrityRaw == "block") integrityRaw
            else "log"
        userPrefs.saveSecurityFlags(
            rootBlock = s["root_block_enabled"] != "false",
            integrity = integrity,
        )
    }

    suspend fun isScreenshotProtectionOn(): Boolean =
        userPrefs.screenshotProtection.first()

    suspend fun isWatermarkOn(): Boolean =
        userPrefs.watermarkEnabled.first()

    suspend fun isRootBlockEnabled(): Boolean =
        userPrefs.rootBlockEnabled.first()

    suspend fun integrityEnforcement(): String =
        userPrefs.integrityEnforcement.first()
}
