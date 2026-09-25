package com.securelearn.app

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.repository.SettingsRepository
import com.securelearn.app.ui.navigation.AppNavHost
import com.securelearn.app.ui.theme.SecureLearnTheme
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

/**
 * Single activity. FLAG_SECURE is applied app-wide (simplest and safest):
 * it blocks OS screenshots and screen recordings on every screen, including
 * the secure PDF viewer. The admin can toggle it off via Settings, in which
 * case the flag is cleared once the flags are fetched.
 */
@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var sessionManager: SessionManager

    @Inject
    lateinit var settingsRepository: SettingsRepository

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Secure by default — before the remote flags even load.
        applyFlagSecure(true)

        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                settingsRepository.screenshotProtection.collectLatest { enabled ->
                    applyFlagSecure(enabled)
                }
            }
        }

        setContent {
            SecureLearnTheme {
                AppNavHost(sessionManager = sessionManager)
            }
        }
    }

    private fun applyFlagSecure(secure: Boolean) {
        if (secure) {
            window.setFlags(
                WindowManager.LayoutParams.FLAG_SECURE,
                WindowManager.LayoutParams.FLAG_SECURE,
            )
        } else {
            window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
