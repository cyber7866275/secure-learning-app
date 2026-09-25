package com.securelearn.app.ui.screens.videos

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayCircle
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.securelearn.app.data.remote.dto.VideoItem
import com.securelearn.app.ui.components.EmptyScreen
import com.securelearn.app.ui.components.ErrorScreen
import com.securelearn.app.ui.components.LoadingScreen

/**
 * Video library. Each row opens the secure player — there is intentionally
 * NO thumbnail preview image and NO download button: streams are AES-128 HLS
 * served through the authorized manifest endpoint only.
 */
@Composable
fun VideosScreen(
    viewModel: VideosViewModel = hiltViewModel(),
    onOpenVideo: (String, String) -> Unit,
) {
    val ui by viewModel.ui.collectAsState()

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("Videos", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(4.dp))
            Text(
                "Streamed securely — no downloads.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        when {
            ui.loading -> LoadingScreen("Loading videos…")
            ui.error != null -> ErrorScreen(ui.error!!, onRetry = viewModel::refresh)
            ui.items.isEmpty() -> EmptyScreen("No videos available yet.")
            else -> LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(ui.items, key = { it.id }) { video ->
                    VideoRow(video = video, onClick = { onOpenVideo(video.id, video.title) })
                }
            }
        }
    }
}

@Composable
private fun VideoRow(video: VideoItem, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                Icons.Filled.PlayCircle,
                contentDescription = null,
                modifier = Modifier.size(44.dp),
                tint = MaterialTheme.colorScheme.primary,
            )
            Column(
                modifier = Modifier
                    .weight(1f)
                    .padding(start = 12.dp),
            ) {
                Text(video.title, style = MaterialTheme.typography.titleMedium, maxLines = 2)
                Spacer(Modifier.height(4.dp))
                Text(
                    listOfNotNull(
                        formatDuration(video.durationSec),
                        video.subject?.name ?: video.category?.name,
                    ).joinToString(" · "),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}
