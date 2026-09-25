package com.securelearn.app.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.remote.dto.BannerDto
import com.securelearn.app.data.remote.dto.CategoryNode
import com.securelearn.app.data.remote.dto.PdfItem
import com.securelearn.app.data.remote.userMessage
import com.securelearn.app.data.repository.ContentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class HomeUiState(
    val loading: Boolean = true,
    val userName: String = "",
    val banners: List<BannerDto> = emptyList(),
    val categories: List<CategoryNode> = emptyList(),
    val recentPdfs: List<PdfItem> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val contentRepository: ContentRepository,
    private val sessionManager: SessionManager,
) : ViewModel() {

    private val _ui = MutableStateFlow(HomeUiState())
    val ui: StateFlow<HomeUiState> = _ui.asStateFlow()

    init {
        load()
    }

    fun load() {
        _ui.value = _ui.value.copy(loading = true, error = null)
        viewModelScope.launch {
            try {
                val bannersD = async { contentRepository.banners() }
                val treeD = async { contentRepository.libraryTree() }
                val pdfsD = async { contentRepository.libraryPdfs(limit = 6) }
                _ui.value = HomeUiState(
                    loading = false,
                    userName = sessionManager.userName().orEmpty(),
                    banners = bannersD.await(),
                    categories = treeD.await(),
                    recentPdfs = pdfsD.await().data,
                )
            } catch (t: Throwable) {
                _ui.value = _ui.value.copy(loading = false, error = userMessage(t))
            }
        }
    }
}
