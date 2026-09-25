package com.securelearn.app.data.analytics

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.securelearn.app.data.remote.ApiService
import com.securelearn.app.data.remote.dto.AnalyticsEventBatch
import com.securelearn.app.di.AuthClient
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.util.concurrent.TimeUnit

/**
 * Flushes the local analytics queue to POST /analytics/events (Stage 6).
 *
 * - Runs every 15 minutes (the minimum WorkManager allows for periodic work)
 *   with a CONNECTED constraint — offline devices simply keep queueing.
 * - Sends at most [UPLOAD_BATCH_MAX] events per run (backend @ArrayMaxSize(200)).
 * - On HTTP 2xx (Retrofit returns instead of throwing) the sent lines are
 *   removed from the queue; on any failure the events stay queued and the
 *   next periodic run retries. No foreground work, no wake locks.
 */
@HiltWorker
class AnalyticsUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    @AuthClient private val api: ApiService,
    private val reporter: AnalyticsReporter,
) : CoroutineWorker(appContext, workerParams) {

    override suspend fun doWork(): Result {
        val batch = try {
            reporter.drainForUpload(UPLOAD_BATCH_MAX)
        } catch (t: Throwable) {
            Log.w(TAG, "failed to read analytics queue", t)
            return Result.retry()
        }
        if (batch.isEmpty()) return Result.success()

        return try {
            val response = api.reportEvents(AnalyticsEventBatch(batch.map { it.event }))
            Log.d(TAG, "uploaded ${response.received}/${batch.size} analytics events")
            reporter.removeUploaded(batch.map { it.rawLine })
            Result.success()
        } catch (t: Throwable) {
            // Events stay in the queue; the next periodic run retries them.
            Log.w(TAG, "analytics upload failed (attempt $runAttemptCount)", t)
            if (runAttemptCount >= MAX_ATTEMPTS) Result.failure() else Result.retry()
        }
    }

    companion object {
        private const val TAG = "AnalyticsUpload"
        private const val UNIQUE_WORK_NAME = "analytics-upload"
        private const val MAX_ATTEMPTS = 5

        /** Backend EventBatchDto caps batches at 200 events. */
        const val UPLOAD_BATCH_MAX = 200

        /**
         * Schedules the unique periodic upload. ExistingPeriodicWorkPolicy.KEEP
         * makes this idempotent — safe to call on every process start.
         */
        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<AnalyticsUploadWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build(),
                )
                .build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
