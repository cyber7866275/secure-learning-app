package com.securelearn.app.ui.screens.viewer

import android.content.Context
import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.securelearn.app.data.analytics.AnalyticsEventTypes
import com.securelearn.app.data.analytics.AnalyticsReporter
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.remote.userMessage
import com.securelearn.app.data.repository.SettingsRepository
import com.securelearn.app.di.PlainClient
import com.securelearn.app.domain.usecase.RequestPdfAccessUseCase
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.FileOutputStream
import java.io.IOException

/** Thrown when the presigned-URL download itself returns an HTTP error. */
class HttpDownloadException(val code: Int, message: String) : IOException(message)

sealed interface ViewerUiState {
    data object Loading : ViewerUiState
    data class Ready(val helper: PdfRenderHelper, val pageCount: Int) : ViewerUiState
    data class Error(val message: String) : ViewerUiState
}

/**
 * Serializes access to a [PdfRenderer] (it is not thread-safe) and renders
 * pages to Bitmaps at the requested width. No text layer is ever produced,
 * so text selection / copy is impossible by construction.
 */
class PdfRenderHelper(private val renderer: PdfRenderer) {
    private val mutex = Mutex()
    val pageCount: Int get() = renderer.pageCount

    suspend fun renderPage(index: Int, targetWidthPx: Int): Bitmap = mutex.withLock {
        val page = renderer.openPage(index)
        try {
            val scale = targetWidthPx / page.width.toFloat()
            val w = targetWidthPx.coerceAtLeast(1)
            val h = (page.height * scale).toInt().coerceIn(1, 6000)
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            // White background so transparent PDFs don't render as black.
            bmp.eraseColor(android.graphics.Color.WHITE)
            page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
            bmp
        } finally {
            page.close()
        }
    }

    fun close() {
        try {
            renderer.close()
        } catch (_: Exception) {
        }
    }
}

@HiltViewModel
class PdfViewerViewModel @Inject constructor(
    private val requestPdfAccess: RequestPdfAccessUseCase,
    @PlainClient private val httpClient: OkHttpClient,
    private val sessionManager: SessionManager,
    private val settingsRepository: SettingsRepository,
    private val analytics: AnalyticsReporter,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val pdfId: String = checkNotNull(savedStateHandle["pdfId"])

    private val _state = MutableStateFlow<ViewerUiState>(ViewerUiState.Loading)
    val state: StateFlow<ViewerUiState> = _state.asStateFlow()

    val watermarkEnabled = settingsRepository.watermarkEnabled
    val userName: String get() = sessionManager.userName().orEmpty()
    val userId: String get() = sessionManager.userId().orEmpty()

    private var tempFile: File? = null
    private var pfd: ParcelFileDescriptor? = null
    private var helper: PdfRenderHelper? = null

    /** True once the PDF has opened successfully — gates the pdf_close event. */
    private var analyticsOpened = false

    init {
        load()
    }

    fun load() {
        // Tear down any previous attempt before retrying.
        closeResources()
        _state.value = ViewerUiState.Loading
        viewModelScope.launch {
            try {
                val file = withContext(Dispatchers.IO) { fetchPdf() }
                openRenderer(file)
            } catch (t: Throwable) {
                _state.value = ViewerUiState.Error(userMessage(t))
            }
        }
    }

    /**
     * 1. Ask the backend for a short-lived presigned URL (permission-checked).
     * 2. Download to an app-private temp file (cacheDir, MODE_PRIVATE).
     * 3. If the download 403s (URL expired mid-flight), request a fresh URL
     *    once and retry. Any other failure wipes the partial file.
     */
    private fun fetchPdf(): File {
        val tmp = File(context.cacheDir, "secure_${pdfId}.tmp")
        try {
            val first = requestPdfAccess(pdfId).getOrThrow()
            try {
                downloadToTemp(first.url, tmp)
            } catch (e: HttpDownloadException) {
                if (e.code == 403) {
                    val fresh = requestPdfAccess(pdfId).getOrThrow()
                    downloadToTemp(fresh.url, tmp)
                } else {
                    throw e
                }
            }
            return tmp
        } catch (t: Throwable) {
            secureDelete(tmp)
            throw t
        }
    }

    private fun downloadToTemp(url: String, file: File) {
        val request = Request.Builder().url(url).get().build()
        httpClient.newCall(request).execute().use { resp ->
            if (!resp.isSuccessful) {
                throw HttpDownloadException(resp.code, "Download failed: HTTP ${resp.code}")
            }
            val body = resp.body ?: throw IOException("Empty download response")
            FileOutputStream(file).use { out ->
                body.byteStream().copyTo(out)
            }
        }
    }

    private fun openRenderer(file: File) {
        tempFile = file
        pfd = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        val renderer = PdfRenderer(pfd!!)
        helper = PdfRenderHelper(renderer)
        _state.value = ViewerUiState.Ready(helper!!, renderer.pageCount)
        // Stage 6 analytics: the PDF is now actually viewable.
        analyticsOpened = true
        analytics.track(AnalyticsEventTypes.CONTENT_OPEN, "pdf", pdfId)
    }

    private fun closeResources() {
        try {
            helper?.close()
        } catch (_: Exception) {
        }
        helper = null
        try {
            pfd?.close()
        } catch (_: Exception) {
        }
        pfd = null
        tempFile?.let { secureDelete(it) }
        tempFile = null
    }

    override fun onCleared() {
        // Stage 6 analytics: only if the PDF actually opened (not on load failure).
        if (analyticsOpened) {
            analytics.track(AnalyticsEventTypes.PDF_CLOSE, "pdf", pdfId)
        }
        closeResources()
        super.onCleared()
    }
}
