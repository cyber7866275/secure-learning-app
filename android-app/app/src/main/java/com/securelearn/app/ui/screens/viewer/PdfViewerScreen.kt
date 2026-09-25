package com.securelearn.app.ui.screens.viewer

import android.graphics.Bitmap
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.securelearn.app.ui.components.ErrorScreen
import com.securelearn.app.ui.components.LoadingScreen
import com.securelearn.app.ui.components.WatermarkOverlay

/**
 * Secure PDF viewer.
 *
 * Security properties:
 * - The PDF is fetched through the permission-checked `/pdfs/:id/access`
 *   gate and downloaded to an app-private temp file (never to shared storage).
 * - Pages are rendered to Bitmaps with PdfRenderer — there is NO text layer,
 *   so text selection / copy is impossible by construction. No long-press
 *   handlers are registered anywhere in this screen.
 * - FLAG_SECURE is set app-wide in MainActivity: OS screenshots and screen
 *   recordings show a black screen.
 * - No share / print / download affordances exist; the temp file is
 *   zero-overwritten and deleted when the viewer closes.
 * - A dynamic watermark (name • user id • timestamp) floats above the
 *   content and jumps to a new random position every 25 seconds.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun PdfViewerScreen(
    pdfId: String,
    title: String,
    onBack: () -> Unit,
    viewModel: PdfViewerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val watermarkOn by viewModel.watermarkEnabled.collectAsState(initial = true)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title.ifBlank { "Document" }, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(Color(0xFF525659)), // neutral page backdrop
        ) {
            when (val s = state) {
                ViewerUiState.Loading -> LoadingScreen("Opening secure document…")
                is ViewerUiState.Error -> ErrorScreen(s.message, onRetry = viewModel::load)
                is ViewerUiState.Ready -> {
                    val pagerState = rememberPagerState(pageCount = { s.pageCount })
                    HorizontalPager(
                        state = pagerState,
                        modifier = Modifier.fillMaxSize(),
                    ) { page ->
                        // Key on the whole Ready state: a retry creates a NEW
                        // helper, and the page must re-render from it.
                        PdfPage(ready = s, index = page)
                    }
                    Text(
                        "Page ${pagerState.currentPage + 1} of ${s.pageCount}",
                        style = MaterialTheme.typography.labelSmall,
                        color = Color.White,
                        modifier = Modifier
                            .align(Alignment.BottomCenter)
                            .padding(bottom = 12.dp),
                    )
                    WatermarkOverlay(
                        userName = viewModel.userName,
                        userId = viewModel.userId,
                        enabled = watermarkOn,
                    )
                }
            }
        }
    }
}

/**
 * Renders one page to a Bitmap on a background thread and recycles it when
 * the page leaves the composition. Rendering is serialized inside
 * [PdfRenderHelper] because PdfRenderer is not thread-safe.
 *
 * The effect is keyed on the [ViewerUiState.Ready] instance (a data class, so
 * a viewer retry with a fresh helper restarts rendering) plus the page index.
 */
@Composable
private fun PdfPage(ready: ViewerUiState.Ready, index: Int) {
    var bitmap by remember { mutableStateOf<Bitmap?>(null) }

    val density = LocalDensity.current
    val configuration = LocalConfiguration.current
    val targetWidthPx = remember(density, configuration) {
        with(density) { configuration.screenWidthDp.dp.roundToPx() }
    }

    LaunchedEffect(ready, index) {
        var bmp: Bitmap? = null
        try {
            bmp = ready.helper.renderPage(index, targetWidthPx)
            bitmap?.recycle() // drop the previous bitmap (e.g. helper changed)
            bitmap = bmp
            bmp = null // ownership transferred to state
        } finally {
            bmp?.recycle() // only when cancelled before assignment
        }
    }
    DisposableEffect(ready, index) {
        onDispose {
            bitmap?.recycle()
            bitmap = null
        }
    }

    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        val bmp = bitmap
        if (bmp != null) {
            Image(
                bitmap = bmp.asImageBitmap(),
                contentDescription = "Page ${index + 1}",
                contentScale = ContentScale.FillWidth,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            CircularProgressIndicator(color = Color.White)
        }
    }
}
