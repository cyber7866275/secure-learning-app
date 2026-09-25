package com.securelearn.app.ui.screens.library

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.securelearn.app.data.remote.dto.CategoryNode
import com.securelearn.app.data.remote.dto.PdfItem
import com.securelearn.app.data.remote.userMessage
import com.securelearn.app.data.repository.ContentRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

data class LibraryUiState(
    val loading: Boolean = true,
    val items: List<PdfItem> = emptyList(),
    val total: Int = 0,
    val page: Int = 1,
    val loadingMore: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class LibraryViewModel @Inject constructor(
    private val contentRepository: ContentRepository,
) : ViewModel() {

    private val _ui = MutableStateFlow(LibraryUiState())
    val ui: StateFlow<LibraryUiState> = _ui.asStateFlow()

    private val _categories = MutableStateFlow<List<CategoryNode>>(emptyList())
    val categories: StateFlow<List<CategoryNode>> = _categories.asStateFlow()

    var search: String = ""
        private set
    var categoryId: String? = null
        private set

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            try {
                _categories.value = contentRepository.libraryTree()
            } catch (_: Exception) {
                // Tree is a nice-to-have filter; the list still works without it.
            }
        }
        refresh()
    }

    fun onSearchChanged(value: String) {
        search = value
        searchJob?.cancel()
        searchJob = viewModelScope.launch {
            delay(400) // debounce
            refresh()
        }
    }

    fun onCategorySelected(id: String?) {
        categoryId = id
        refresh()
    }

    fun refresh() {
        _ui.value = _ui.value.copy(loading = true, error = null, page = 1)
        viewModelScope.launch {
            try {
                val res = contentRepository.libraryPdfs(
                    search = search.ifBlank { null },
                    categoryId = categoryId,
                    page = 1,
                )
                _ui.value = LibraryUiState(
                    loading = false,
                    items = res.data,
                    total = res.total,
                    page = res.page,
                )
            } catch (t: Throwable) {
                _ui.value = _ui.value.copy(loading = false, error = userMessage(t))
            }
        }
    }

    fun loadMore() {
        val cur = _ui.value
        if (cur.loading || cur.loadingMore || cur.items.size >= cur.total) return
        _ui.value = cur.copy(loadingMore = true)
        viewModelScope.launch {
            try {
                val res = contentRepository.libraryPdfs(
                    search = search.ifBlank { null },
                    categoryId = categoryId,
                    page = cur.page + 1,
                )
                _ui.value = cur.copy(
                    loadingMore = false,
                    items = cur.items + res.data,
                    page = res.page,
                )
            } catch (_: Exception) {
                _ui.value = cur.copy(loadingMore = false)
            }
        }
    }
}
