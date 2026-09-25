package com.securelearn.app.di

import com.securelearn.app.BuildConfig
import com.securelearn.app.data.local.UserPrefs
import com.securelearn.app.data.remote.ApiService
import com.securelearn.app.data.remote.AuthInterceptor
import com.securelearn.app.data.remote.TokenAuthenticator
import com.securelearn.app.data.repository.AuthRepository
import com.securelearn.app.data.repository.ContentRepository
import com.securelearn.app.data.repository.DeviceRepository
import com.securelearn.app.data.repository.SettingsRepository
import com.securelearn.app.data.security.IntegrityTokenProvider
import com.securelearn.app.data.security.RootDetector
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    private fun logging(): HttpLoggingInterceptor = HttpLoggingInterceptor().apply {
        // Never log the Authorization header, even in debug builds.
        redactHeader("Authorization")
        // Body logging only in debug builds — never leak tokens in release.
        level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BODY
        else HttpLoggingInterceptor.Level.NONE
    }

    @Provides
    @Singleton
    @PlainClient
    fun providePlainOkHttp(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .addInterceptor(logging())
        .apply {
            // Stage 7: certificate pinning. Active in RELEASE builds only, and
            // only when pins are configured — debug builds skip pinning so
            // local HTTP dev servers keep working. The @AuthClient derives
            // from this builder via newBuilder(), so it inherits the pins.
            certificatePinner()?.let { certificatePinner(it) }
        }
        .build()

    /**
     * Builds a [CertificatePinner] from BuildConfig.CERT_PINS, or null when
     * pinning is disabled (debug build, or no pins configured).
     *
     * Why release-only: pins bind the app to specific server certificates.
     * Dev machines use self-signed/localhost certs that would fail the pin
     * check, and a misconfigured pin in a dev loop wastes everyone's time.
     * Release builds MUST ship pins (see local.properties.example +
     * README); include a backup pin for the next certificate so rotation
     * doesn't brick installed apps.
     */
    private fun certificatePinner(): CertificatePinner? {
        if (BuildConfig.DEBUG) return null
        val pins = BuildConfig.CERT_PINS
            .split(",")
            .map { it.trim() }
            .filter { it.startsWith("sha256/") }
        if (pins.isEmpty()) return null
        val host = try {
            java.net.URI(BuildConfig.BASE_URL).host
        } catch (_: Exception) {
            null
        }
        if (host.isNullOrBlank()) return null
        return CertificatePinner.Builder().apply {
            pins.forEach { add(host, it) }
        }.build()
    }

    /** Plain API: used for login/OTP/refresh and for presigned-URL downloads. */
    @Provides
    @Singleton
    @PlainClient
    fun providePlainApi(@PlainClient client: OkHttpClient): ApiService =
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL + "/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)

    @Provides
    @Singleton
    @AuthClient
    fun provideAuthOkHttp(
        interceptor: AuthInterceptor,
        authenticator: TokenAuthenticator,
        @PlainClient plain: OkHttpClient,
    ): OkHttpClient = plain.newBuilder()
        .addInterceptor(interceptor)
        .authenticator(authenticator)
        .build()

    /** Authenticated API: every request carries the Bearer token. */
    @Provides
    @Singleton
    @AuthClient
    fun provideAuthApi(@AuthClient client: OkHttpClient): ApiService =
        Retrofit.Builder()
            .baseUrl(BuildConfig.BASE_URL + "/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)

    @Provides
    @Singleton
    fun provideAuthRepository(
        @PlainClient api: ApiService,
        sessionManager: SessionManager,
        integrityTokenProvider: IntegrityTokenProvider,
        rootDetector: RootDetector,
    ): AuthRepository = AuthRepository(api, sessionManager, integrityTokenProvider, rootDetector)

    @Provides
    @Singleton
    fun provideContentRepository(@AuthClient api: ApiService): ContentRepository =
        ContentRepository(api)

    @Provides
    @Singleton
    fun provideDeviceRepository(@AuthClient api: ApiService): DeviceRepository =
        DeviceRepository(api)

    @Provides
    @Singleton
    fun provideSettingsRepository(
        @PlainClient api: ApiService,
        userPrefs: UserPrefs,
    ): SettingsRepository = SettingsRepository(api, userPrefs)

    // SessionManager and UserPrefs have @Inject constructors — no bindings needed.
}
