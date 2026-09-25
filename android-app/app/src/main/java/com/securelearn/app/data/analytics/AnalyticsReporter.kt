package com.securelearn.app.data.analytics

import android.content.Context
import android.util.Log
import com.google.gson.Gson
import com.securelearn.app.data.remote.dto.AnalyticsEventDto
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Whitelist of analytics event types. Must match the backend exactly
 * (backend/src/analytics/dto/analytics.dto.ts ANALYTICS_EVENT_TYPES) —
 * anything else is rejected server-side, so track() drops it client-side.
 */
object AnalyticsEventTypes {
    const val CONTENT_OPEN = "content_open"
    const val PDF_CLOSE = "pdf_close"
    const val VIDEO_PLAY = "video_play"
    const val VIDEO_PAUSE = "video_pause"
    const val VIDEO_HEARTBEAT = "video_heartbeat"
    const val VIDEO_COMPLETE = "video_complete"
    const val VIDEO_SEEK = "video_seek"
    /** Device-level event: no content attached. Server writes a ROOT_DETECTED alert. */
    const val ROOT_DETECTED = "root_detected"

    val ALL: Set<String> = setOf(
        CONTENT_OPEN, PDF_CLOSE, VIDEO_PLAY, VIDEO_PAUSE,
        VIDEO_HEARTBEAT, VIDEO_COMPLETE, VIDEO_SEEK, ROOT_DETECTED,
    )
}

/**
 * One queued event together with its raw queue-file line, so the upload
 * worker can acknowledge exactly the lines it sent.
 */
data class QueuedAnalyticsEvent(val rawLine: String, val event: AnalyticsEventDto)

/**
 * Crash-safe local analytics queue + batch-upload plumbing (Stage 6).
 *
 * - Events are appended as JSON lines to `cacheDir/analytics_queue.jsonl`.
 * - All file access is synchronized on [lock]; append mode keeps each record
 *   a single atomic line, and readers skip malformed lines.
 * - The queue is capped at [MAX_QUEUED_EVENTS] (oldest dropped first) so a
 *   never-online device can't fill storage.
 * - [track] never throws: every failure is swallowed with a log so analytics
 *   can never break the UI.
 * - [AnalyticsUploadWorker] drains the queue every 15 minutes (CONNECTED
 *   constraint) and acks only the lines the server accepted; unsent lines
 *   stay queued for the next run. No new permissions, no foreground work.
 */
@Singleton
class AnalyticsReporter @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val gson = Gson()
    private val lock = Any()

    private val queueFile: File
        get() = File(context.cacheDir, QUEUE_FILE_NAME)

    fun track(
        type: String,
        contentType: String? = null,
        contentId: String? = null,
        positionSec: Double? = null,
        durationSec: Double? = null,
    ) {
        try {
            if (type !in AnalyticsEventTypes.ALL) {
                Log.w(TAG, "dropping analytics event with unknown type: $type")
                return
            }
            // Device-level events (root_detected) carry no content; content
            // events must always name their content.
            val deviceEvent = type == AnalyticsEventTypes.ROOT_DETECTED
            if (deviceEvent) {
                if (contentType != null || contentId != null) {
                    Log.w(TAG, "dropping device event with content attached: $type")
                    return
                }
            } else {
                if (contentType != "pdf" && contentType != "video") {
                    Log.w(TAG, "dropping analytics event with unknown contentType: $contentType")
                    return
                }
                if (contentId.isNullOrBlank()) return
            }
            val dto = AnalyticsEventDto(
                type = type,
                contentType = contentType,
                contentId = contentId,
                // Backend validates @Min(0); never send negatives.
                positionSec = positionSec?.takeIf { it >= 0 },
                durationSec = durationSec?.takeIf { it >= 0 },
            )
            val line = gson.toJson(dto)
            synchronized(lock) {
                val file = queueFile
                val existing = if (file.exists()) file.readLines() else emptyList()
                if (existing.size >= MAX_QUEUED_EVENTS) {
                    // At cap: drop oldest, keep newest MAX-1, append the new one.
                    val kept = existing.drop(existing.size - MAX_QUEUED_EVENTS + 1)
                    file.writeText((kept + line).joinToString("\n", postfix = "\n"))
                } else {
                    file.appendText(line + "\n")
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "analytics track() failed; must never break the UI", t)
        }
    }

    /**
     * Reads up to [max] valid events from the head of the queue for upload.
     * Malformed lines are pruned here so they can never jam the queue.
     */
    fun drainForUpload(max: Int): List<QueuedAnalyticsEvent> {
        synchronized(lock) {
            val file = queueFile
            if (!file.exists()) return emptyList()
            val raw = file.readLines().filter { it.isNotBlank() }
            val parsed = raw.mapNotNull { line ->
                try {
                    val dto = gson.fromJson(line, AnalyticsEventDto::class.java)
                    if (dto.type in AnalyticsEventTypes.ALL) QueuedAnalyticsEvent(line, dto) else null
                } catch (_: Exception) {
                    null
                }
            }
            if (parsed.size != raw.size) {
                file.writeText(
                    if (parsed.isEmpty()) ""
                    else parsed.joinToString("\n", postfix = "\n") { it.rawLine },
                )
            }
            return parsed.take(max)
        }
    }

    /**
     * Removes exactly the uploaded lines from the queue (first-occurrence
     * multiset removal, so duplicate identical lines are handled correctly).
     * Lines appended while the upload was in flight are untouched.
     */
    fun removeUploaded(rawLines: List<String>) {
        if (rawLines.isEmpty()) return
        synchronized(lock) {
            val file = queueFile
            if (!file.exists()) return
            val toRemove = rawLines.toMutableList()
            val remaining = file.readLines().filter { line ->
                val idx = toRemove.indexOf(line)
                if (idx >= 0) {
                    toRemove.removeAt(idx)
                    false
                } else {
                    true
                }
            }
            file.writeText(
                if (remaining.isEmpty()) ""
                else remaining.joinToString("\n", postfix = "\n"),
            )
        }
    }

    companion object {
        private const val TAG = "AnalyticsReporter"
        private const val QUEUE_FILE_NAME = "analytics_queue.jsonl"

        /** Hard cap so a never-online device can't fill storage (oldest dropped). */
        const val MAX_QUEUED_EVENTS = 1000
    }
}
