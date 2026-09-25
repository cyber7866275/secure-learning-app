package com.securelearn.app.ui.screens.videos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.securelearn.app.data.remote.dto.VideoItem
import com.securelearn.app.data.remote.userMessage
import com.securelearn.app.data.repository.ContentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class VideosUiState(
    val loading: Boolean = true,
    val items: List<VideoItem> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class VideosViewModel @Inject constructor(
    private val content: ContentRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(VideosUiState())
    val ui: StateFlow<VideosUiState> = _ui.asStateFlow()

    init {
        refresh()
    }

    fun refresh() {
        _ui.value = VideosUiState(loading = true)
        viewModelScope.launch {
            try {
                // The library endpoint only returns PUBLISHED + READY videos.
                val page = content.libraryVideos()
                _ui.value = VideosUiState(loading = false, items = page.data)
            } catch (t: Throwable) {
                _ui.value = VideosUiState(loading = false, error = userMessage(t))
            }
        }
    }
}

/** "1:02:33" / "12:05" / "—" */
fun formatDuration(totalSec: Int?): String {
    if (totalSec == null || totalSec < 0) return "—"
    val h = totalSec / 3600
    val m = (totalSec % 3600) / 60
    val s = totalSec % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}
