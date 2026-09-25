package com.securelearn.app.ui.screens.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.remote.dto.DeviceDto
import com.securelearn.app.data.remote.userMessage
import com.securelearn.app.data.repository.AuthRepository
import com.securelearn.app.data.repository.DeviceRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class ProfileUiState(
    val loading: Boolean = true,
    val userId: String = "",
    val userName: String = "",
    val userPhone: String = "",
    val devices: List<DeviceDto> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val sessionManager: SessionManager,
    private val deviceRepository: DeviceRepository,
    private val authRepository: AuthRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(ProfileUiState())
    val ui: StateFlow<ProfileUiState> = _ui.asStateFlow()

    init {
        load()
    }

    fun load() {
        _ui.value = ProfileUiState(
            loading = true,
            userId = sessionManager.userId().orEmpty(),
            userName = sessionManager.userName().orEmpty(),
            userPhone = sessionManager.userPhone().orEmpty(),
        )
        viewModelScope.launch {
            try {
                val devices = deviceRepository.myDevices()
                _ui.value = _ui.value.copy(loading = false, devices = devices)
            } catch (t: Throwable) {
                _ui.value = _ui.value.copy(loading = false, error = userMessage(t))
            }
        }
    }

    fun logout() {
        viewModelScope.launch { authRepository.logout() }
    }
}
