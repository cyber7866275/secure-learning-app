package com.securelearn.app.ui.components

import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.offset
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.IntOffset
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.Random
import kotlinx.coroutines.delay

/**
 * Dynamic watermark drawn OVER the PDF content: `NAME • USER ID • date/time`.
 *
 * - Repositions to a random on-screen location every 25 seconds, making it
 *   hard to crop out of an unauthorized recording.
 * - Non-interactive: no click / pointer-input modifiers, so it never steals
 *   touches from the viewer underneath.
 * - Identifies the leaker if a photo/recording of the screen ever surfaces
 *   (software cannot stop a second camera — the watermark is the deterrent).
 */
@Composable
fun WatermarkOverlay(
    userName: String,
    userId: String,
    enabled: Boolean,
    modifier: Modifier = Modifier,
) {
    if (!enabled) return

    var position by remember { mutableStateOf(randomFraction()) }
    var stamp by remember { mutableStateOf(currentStamp()) }

    LaunchedEffect(Unit) {
        while (true) {
            delay(25_000)
            position = randomFraction()
            stamp = currentStamp()
        }
    }

    BoxWithConstraints(modifier = modifier.fillMaxSize()) {
        val maxW = constraints.maxWidth
        val maxH = constraints.maxHeight
        Text(
            text = "$userName\n$userId\n$stamp",
            textAlign = TextAlign.Center,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier
                .offset {
                    IntOffset(
                        (position.x * maxW * 0.55f).toInt(),
                        (position.y * maxH * 0.7f).toInt(),
                    )
                }
                .rotate(-18f)
                .alpha(0.38f),
        )
    }
}

private fun randomFraction(): Offset {
    val r = Random()
    return Offset(r.nextFloat(), r.nextFloat())
}

private fun currentStamp(): String =
    SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault()).format(Date())
