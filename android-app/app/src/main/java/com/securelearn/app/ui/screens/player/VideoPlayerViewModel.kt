package com.securelearn.app.ui.screens.player

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.okhttp.OkHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.hls.HlsMediaSource
import com.securelearn.app.data.analytics.AnalyticsEventTypes
import com.securelearn.app.data.analytics.AnalyticsReporter
import com.securelearn.app.data.local.SessionManager
import com.securelearn.app.data.remote.userMessage
import com.securelearn.app.data.repository.ContentRepository
import com.securelearn.app.data.repository.SettingsRepository
import com.securelearn.app.di.AuthClient
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient

sealed interface PlayerUiState {
    data object Loading : PlayerUiState
    data class Ready(val player: ExoPlayer) : PlayerUiState
    data class Error(val message: String) : PlayerUiState
}

/**
 * Secure HLS video player.
 *
 * How it works:
 * 1. POST /videos/:id/access runs the full access gate (published, READY,
 *    device valid, permission) and returns the AUTHORIZED master-manifest URL.
 * 2. ExoPlayer loads that master with our authenticated OkHttp client
 *    (Bearer <redacted> attached — harmless on the tokenized sub-requests).
 * 3. Variant playlists carry a 10-minute HMAC token; segments and the AES-128
 *    key arrive as short-lived presigned URLs the server rewrites per request.
 *
 * Security properties:
 * - No offline download: no DownloadManager / cache is configured, and the
 *   player UI is the stock controller (play/pause/seek) — no download button.
 * - FLAG_SECURE (app-wide) blocks OS screenshots and screen recordings.
 * - The moving WatermarkOverlay sits above the player (see VideoPlayerScreen).
 *
 * WIDEVINE HOOK (future upgrade, not faked today):
 * Streams are AES-128 HLS, not Widevine. When the backend starts issuing
 * Widevine licenses, attach the DRM session manager here:
 *
 *     val drmSessionManager = DefaultDrmSessionManager.Builder()
 *         .setUuidAndExoMediaDrmProvider(C.WIDEVINE_UUID, FrameworkMediaDrm.DEFAULT_PROVIDER)
 *         .build(HttpMediaDrmCallback(licenseUrl, dataSourceFactory))
 *     ExoPlayer.Builder(context)
 *         .setMediaSourceFactory(
 *             HlsMediaSource.Factory(dataSourceFactory)
 *                 .setDrmSessionManagerProvider { drmSessionManager })
 *         .build()
 *
 * …plus a per-user license token minted alongside the HLS token.
 */
@HiltViewModel
class VideoPlayerViewModel @Inject constructor(
    private val content: ContentRepository,
    @AuthClient private val authClient: OkHttpClient,
    private val sessionManager: SessionManager,
    private val settingsRepository: SettingsRepository,
    private val analytics: AnalyticsReporter,
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val videoId: String = checkNotNull(savedStateHandle["videoId"])

    private val _state = MutableStateFlow<PlayerUiState>(PlayerUiState.Loading)
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    val watermarkEnabled = settingsRepository.watermarkEnabled
    val userName: String get() = sessionManager.userName().orEmpty()
    val userId: String get() = sessionManager.userId().orEmpty()

    private var player: ExoPlayer? = null

    /** True while a video_play event is "open" (no matching pause yet). */
    private var playNotified = false

    /** Guards video_complete against double-fire and suppresses a trailing pause. */
    private var completeNotified = false

    private var heartbeatJob: Job? = null

    private val errorListener = object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
            _state.value = PlayerUiState.Error(userMessage(error))
        }
    }

    /**
     * Stage 6 analytics listener. onIsPlayingChanged only fires on real
     * transitions; buffering stalls are filtered out (isPlaying flips off/on
     * around STATE_BUFFERING without a user-visible pause).
     */
    private val playbackListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            val p = player ?: return
            if (isPlaying) {
                if (!playNotified) {
                    playNotified = true
                    analytics.track(AnalyticsEventTypes.VIDEO_PLAY, "video", videoId)
                }
                startHeartbeat()
            } else {
                if (playNotified &&
                    !completeNotified &&
                    p.playbackState != Player.STATE_BUFFERING
                ) {
                    playNotified = false
                    analytics.track(
                        AnalyticsEventTypes.VIDEO_PAUSE,
                        "video",
                        videoId,
                        positionSec = p.currentPosition / 1000.0,
                    )
                }
                stopHeartbeat()
            }
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED && !completeNotified) {
                completeNotified = true
                val durationSec = player?.duration?.takeIf { it > 0 }?.div(1000.0)
                analytics.track(
                    AnalyticsEventTypes.VIDEO_COMPLETE,
                    "video",
                    videoId,
                    durationSec = durationSec,
                )
                stopHeartbeat()
            }
        }
    }

    /** 30-second watch-time heartbeat while playing; cancelled on pause/clear. */
    private fun startHeartbeat() {
        if (heartbeatJob?.isActive == true) return
        heartbeatJob = viewModelScope.launch {
            while (true) {
                delay(HEARTBEAT_INTERVAL_MS)
                val p = player
                if (p == null || !p.isPlaying) break
                analytics.track(
                    AnalyticsEventTypes.VIDEO_HEARTBEAT,
                    "video",
                    videoId,
                    positionSec = p.currentPosition / 1000.0,
                )
            }
        }
    }

    private fun stopHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    init {
        load()
    }

    fun load() {
        releasePlayer()
        stopHeartbeat()
        playNotified = false
        completeNotified = false
        _state.value = PlayerUiState.Loading
        viewModelScope.launch {
            try {
                val access = content.requestVideoAccess(videoId)
                val exo = buildPlayer(access.url)
                player = exo
                _state.value = PlayerUiState.Ready(exo)
            } catch (t: Throwable) {
                _state.value = PlayerUiState.Error(userMessage(t))
            }
        }
    }

    private fun buildPlayer(manifestUrl: String): ExoPlayer {
        // Authenticated data source: the master request needs the Bearer <redacted>
        // the tokenized variant/segment sub-requests ignore it safely.
        val dataSourceFactory = OkHttpDataSource.Factory(authClient)
        val mediaSource = HlsMediaSource.Factory(dataSourceFactory)
            .createMediaSource(MediaItem.fromUri(manifestUrl))
        return ExoPlayer.Builder(context).build().apply {
            addListener(errorListener)
            addListener(playbackListener)
            setMediaSource(mediaSource)
            prepare()
            playWhenReady = true
        }
    }

    private fun releasePlayer() {
        try {
            player?.removeListener(errorListener)
            player?.removeListener(playbackListener)
            player?.release()
        } catch (_: Exception) {
        }
        player = null
        stopHeartbeat()
    }

    override fun onCleared() {
        releasePlayer()
        super.onCleared()
    }

    companion object {
        /** Watch-time heartbeat cadence while the video is playing. */
        private const val HEARTBEAT_INTERVAL_MS = 30_000L
    }
}
