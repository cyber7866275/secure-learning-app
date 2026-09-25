package com.securelearn.app.ui.screens.splash

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.securelearn.app.data.analytics.AnalyticsEventTypes
import com.securelearn.app.data.analytics.AnalyticsReporter
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.repository.SettingsRepository
import com.securelearn.app.data.security.RootDetector
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface SplashDecision {
    data object Loading : SplashDecision
    data object GoMain : SplashDecision
    data object GoLogin : SplashDecision
    /** Existing session revoked because the device is rooted and blocking is on. */
    data class GoLoginBlocked(val message: String) : SplashDecision
}

@HiltViewModel
class SplashViewModel @Inject constructor(
    private val sessionManager: SessionManager,
    private val settingsRepository: SettingsRepository,
    private val rootDetector: RootDetector,
    private val analyticsReporter: AnalyticsReporter,
) : ViewModel() {

    private val _decision = MutableStateFlow<SplashDecision>(SplashDecision.Loading)
    val decision: StateFlow<SplashDecision> = _decision.asStateFlow()

    init {
        viewModelScope.launch {
            // Fetch feature flags first (cached most-secure defaults apply on failure).
            settingsRepository.refresh()
            val hasSession = sessionManager.accessTokenSync() != null
            // Stage 7: an existing session on a rooted device is revoked when
            // the admin enabled root blocking. The session is wiped locally;
            // the queued root_detected event uploads on the next login.
            if (hasSession &&
                rootDetector.isRooted() &&
                settingsRepository.isRootBlockEnabled()
            ) {
                analyticsReporter.track(type = AnalyticsEventTypes.ROOT_DETECTED)
                sessionManager.clearSession()
                _decision.value = SplashDecision.GoLoginBlocked(
                    "Your session was ended because this device appears to be " +
                        "rooted. Please log in from a non-rooted device.",
                )
            } else {
                _decision.value =
                    if (hasSession) SplashDecision.GoMain
                    else SplashDecision.GoLogin
            }
        }
    }
}
