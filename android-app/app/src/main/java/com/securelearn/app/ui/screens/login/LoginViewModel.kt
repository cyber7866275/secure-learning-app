package com.securelearn.app.ui.screens.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.securelearn.app.data.analytics.AnalyticsEventTypes
import com.securelearn.app.data.analytics.AnalyticsReporter
import com.securelearn.app.data.remote.userMessage
import com.securelearn.app.data.repository.AuthRepository
import com.securelearn.app.data.repository.SettingsRepository
import com.securelearn.app.data.security.RootDetector
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed interface LoginUiState {
    data object Idle : LoginUiState
    data object Loading : LoginUiState
    data object OtpSent : LoginUiState // waiting for the 6-digit code
    data object Success : LoginUiState
    data class Error(val message: String) : LoginUiState
}

@HiltViewModel
class LoginViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val rootDetector: RootDetector,
    private val settingsRepository: SettingsRepository,
    private val analyticsReporter: AnalyticsReporter,
) : ViewModel() {

    private val _state = MutableStateFlow<LoginUiState>(LoginUiState.Idle)
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    private val _resendSeconds = MutableStateFlow(0)
    val resendSeconds: StateFlow<Int> = _resendSeconds.asStateFlow()

    /** false = phone entry step, true = OTP entry step. */
    private val _otpStage = MutableStateFlow(false)
    val otpStage: StateFlow<Boolean> = _otpStage.asStateFlow()

    private var timerJob: Job? = null
    private var pendingPhone: String? = null

    fun requestOtp(rawPhone: String) {
        val phone = normalizePhone(rawPhone)
        if (phone == null) {
            _state.value = LoginUiState.Error("Enter a valid 10-digit mobile number.")
            return
        }
        pendingPhone = phone
        _state.value = LoginUiState.Loading
        viewModelScope.launch {
            try {
                authRepository.requestOtp(phone)
                _otpStage.value = true
                _state.value = LoginUiState.OtpSent
                startResendTimer()
            } catch (t: Throwable) {
                _state.value = LoginUiState.Error(userMessage(t))
            }
        }
    }

    fun verifyOtp(otp: String, name: String? = null) {
        val phone = pendingPhone ?: run {
            _state.value = LoginUiState.Error("Please request an OTP first.")
            return
        }
        if (!otp.matches(Regex("^\\d{6}$"))) {
            _state.value = LoginUiState.Error("Enter the 6-digit OTP.")
            return
        }
        _state.value = LoginUiState.Loading
        viewModelScope.launch {
            if (blockedOnRootedDevice()) return@launch
            try {
                authRepository.verifyOtp(phone, otp, name?.ifBlank { null })
                timerJob?.cancel()
                _state.value = LoginUiState.Success
            } catch (t: Throwable) {
                _state.value = LoginUiState.Error(userMessage(t))
            }
        }
    }

    fun loginEmail(email: String, password: String) {
        if (!email.contains("@") || password.isBlank()) {
            _state.value = LoginUiState.Error("Enter a valid email and password.")
            return
        }
        _state.value = LoginUiState.Loading
        viewModelScope.launch {
            if (blockedOnRootedDevice()) return@launch
            try {
                authRepository.login(email.trim(), password)
                _state.value = LoginUiState.Success
            } catch (t: Throwable) {
                _state.value = LoginUiState.Error(userMessage(t))
            }
        }
    }

    /**
     * Stage 7 client-side root gate: instant UX so a rooted user isn't sent
     * on a doomed network round trip. The SERVER is the authoritative
     * enforcer (it blocks on the `rooted` DTO flag even if this check is
     * patched out) and writes the ROOT_DETECTED alert there. Here we also
     * queue a `root_detected` analytics event — it uploads whenever the
     * device next has an authenticated session.
     *
     * @return true when the login attempt must not proceed.
     */
    private suspend fun blockedOnRootedDevice(): Boolean {
        if (!rootDetector.isRooted()) return false
        // Report the signal even when we block locally.
        analyticsReporter.track(type = AnalyticsEventTypes.ROOT_DETECTED)
        if (!settingsRepository.isRootBlockEnabled()) return false
        _state.value = LoginUiState.Error(
            "This device appears to be rooted. For security, login is " +
                "disabled on rooted devices. Please use a non-rooted device.",
        )
        return true
    }

    /** Shows an out-of-band notice (e.g. the Splash root-block message). */
    fun showNotice(message: String) {
        if (_state.value is LoginUiState.Idle) _state.value = LoginUiState.Error(message)
    }

    fun backToPhoneEntry() {
        timerJob?.cancel()
        _resendSeconds.value = 0
        _otpStage.value = false
        _state.value = LoginUiState.Idle
    }

    fun clearError() {
        if (_state.value is LoginUiState.Error) _state.value = LoginUiState.Idle
    }

    private fun startResendTimer() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            _resendSeconds.value = 60
            while (_resendSeconds.value > 0) {
                delay(1_000)
                _resendSeconds.value -= 1
            }
        }
    }

    /** Accepts "9876543210" or "+919876543210" → E.164 (+91 default). */
    private fun normalizePhone(raw: String): String? {
        val digits = raw.filter { it.isDigit() }
        return when {
            digits.length == 10 -> "+91$digits"
            raw.trim().matches(Regex("^\\+[1-9]\\d{7,14}$")) -> raw.trim()
            else -> null
        }
    }

    override fun onCleared() {
        timerJob?.cancel()
        super.onCleared()
    }
}
