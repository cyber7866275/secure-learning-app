package com.securelearn.app.data.remote.dto

/**
 * Mirrors backend analytics DTOs exactly (backend/src/analytics/dto/analytics.dto.ts).
 * JSON is camelCase, so Gson maps the fields directly — no @SerializedName needed.
 *
 * `type` is whitelisted server-side; the client must only ever send the values
 * in [com.securelearn.app.data.analytics.AnalyticsEventTypes].
 */
data class AnalyticsEventDto(
    val type: String,
    /** Null for device-level events (root_detected). */
    val contentType: String?,
    /** Null for device-level events (root_detected). */
    val contentId: String?,
    /** Player position in seconds (pause / heartbeat). Null when not applicable. */
    val positionSec: Double? = null,
    /** Total media duration in seconds (complete). Null when not applicable. */
    val durationSec: Double? = null,
)

/** POST analytics/events body. Backend caps batches at 200 events (@ArrayMaxSize). */
data class AnalyticsEventBatch(val events: List<AnalyticsEventDto>)

/** POST analytics/events response: how many events the server accepted. */
data class AnalyticsIngestResponse(val received: Int)
