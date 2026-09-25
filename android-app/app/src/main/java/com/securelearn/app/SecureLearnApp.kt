package com.securelearn.app

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import com.securelearn.app.data.analytics.AnalyticsUploadWorker
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class SecureLearnApp : Application(), Configuration.Provider {

    @Inject
    lateinit var workerFactory: HiltWorkerFactory

    /**
     * Supplies Hilt's worker factory to WorkManager so @HiltWorker workers
     * (AnalyticsUploadWorker) get their dependencies injected.
     * The default androidx.startup WorkManagerInitializer is disabled in the
     * manifest, so the first WorkManager.getInstance() call below performs
     * on-demand initialization with this configuration.
     */
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder()
            .setWorkerFactory(workerFactory)
            .build()

    override fun onCreate() {
        super.onCreate()
        // Unique periodic work with KEEP policy: idempotent across restarts.
        AnalyticsUploadWorker.schedule(this)
    }
}
