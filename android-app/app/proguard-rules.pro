# Keep Retrofit service interfaces and DTOs (Gson uses reflection on fields).
-keep,allowshrinking,allowobfuscation class com.securelearn.app.data.remote.** { *; }
# Keep Hilt entry points.
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.internal.GeneratedComponent { *; }

# ---- Stage 5: Media3 ExoPlayer ----
# The player, HLS source, OkHttp data source and PlayerView are wired at
# runtime; keep them intact through R8 full mode.
-keep class androidx.media3.exoplayer.** { *; }
-keep class androidx.media3.common.** { *; }
-keep class androidx.media3.datasource.okhttp.** { *; }
-keep class androidx.media3.ui.** { *; }

# ---- Stage 6: WorkManager ----
# Worker classes are instantiated by name via the HiltWorkerFactory.
-keep class * extends androidx.work.Worker
-keep class * extends androidx.work.ListenableWorker
-keep class androidx.hilt.work.** { *; }

# ---- Stage 7: Play Integrity + RootBeer ----
# Play Core Integrity talks to Play Services via generated stubs.
-keep class com.google.android.play.core.integrity.** { *; }
# RootBeer runs shell/native checks; keep its implementation.
-keep class com.scottyab.rootbeer.** { *; }

# EncryptedSharedPreferences / EncryptedFile (security-crypto).
-keep class androidx.security.crypto.** { *; }

# Keep BuildConfig fields referenced by name (BASE_URL, CERT_PINS).
-keep class com.securelearn.app.BuildConfig { *; }
