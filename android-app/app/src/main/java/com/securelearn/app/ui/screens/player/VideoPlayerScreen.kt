package com.securelearn.app.ui.screens.player

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.media3.ui.PlayerView
import com.securelearn.app.ui.components.ErrorScreen
import com.securelearn.app.ui.components.LoadingScreen
import com.securelearn.app.ui.components.WatermarkOverlay

/**
 * Secure video player screen.
 *
 * - Stock PlayerView controller only (play / pause / seek / fullscreen) —
 *   no download, share, or "open in" affordances.
 * - The moving [WatermarkOverlay] (name • user id • timestamp, jumps every
 *   25 s) renders ABOVE the player surface, so any screen photo carries it.
 * - FLAG_SECURE is set app-wide in MainActivity: OS screenshots and screen
 *   recordings show black. A second camera filming the screen is outside what
 *   software can stop — the watermark is the deterrent there.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoPlayerScreen(
    videoId: String,
    title: String,
    onBack: () -> Unit,
    viewModel: VideoPlayerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val watermarkOn by viewModel.watermarkEnabled.collectAsState(initial = true)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title.ifBlank { "Video" }, maxLines = 1) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            when (val s = state) {
                is PlayerUiState.Loading -> LoadingScreen("Loading video…")
                is PlayerUiState.Error -> ErrorScreen(s.message, onRetry = viewModel::load)
                is PlayerUiState.Ready -> {
                    AndroidView(
                        factory = { ctx ->
                            PlayerView(ctx).apply {
                                player = s.player
                                // Stock controller only — no download UI is attached.
                                useController = true
                            }
                        },
                        update = { it.player = s.player },
                        onRelease = { it.player = null },
                        modifier = Modifier.fillMaxSize(),
                    )
                    // Watermark above the video surface.
                    WatermarkOverlay(
                        userName = viewModel.userName,
                        userId = viewModel.userId,
                        enabled = watermarkOn,
                    )
                }
            }
        }
    }

    // Pause playback when the user leaves the screen mid-stream.
    DisposableEffect(Unit) {
        onDispose {
            (viewModel.state.value as? PlayerUiState.Ready)?.player?.pause()
        }
    }
}
