package com.securelearn.app.data.remote

import com.securelearn.app.data.remote.dto.AccessResponse
import com.securelearn.app.data.remote.dto.AnalyticsEventBatch
import com.securelearn.app.data.remote.dto.AnalyticsIngestResponse
import com.securelearn.app.data.remote.dto.AuthResponse
import com.securelearn.app.data.remote.dto.BannerDto
import com.securelearn.app.data.remote.dto.CategoryNode
import com.securelearn.app.data.remote.dto.DeviceDto
import com.securelearn.app.data.remote.dto.LoginRequest
import com.securelearn.app.data.remote.dto.MessageResponse
import com.securelearn.app.data.remote.dto.OtpRequest
import com.securelearn.app.data.remote.dto.OtpRequestResponse
import com.securelearn.app.data.remote.dto.OtpVerify
import com.securelearn.app.data.remote.dto.PagedPdfs
import com.securelearn.app.data.remote.dto.PagedVideos
import com.securelearn.app.data.remote.dto.RefreshRequest
import com.securelearn.app.data.remote.dto.RegisterRequest
import com.securelearn.app.data.remote.dto.SettingsResponse
import com.securelearn.app.data.remote.dto.TokenPairDto
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * Mirrors the backend routes 1:1 (NestJS):
 *  auth.controller.ts, library.controller.ts, banners.controller.ts,
 *  devices.controller.ts, settings.controller.ts (PublicSettingsController).
 */
interface ApiService {

    // ---------------------------------------------------------- auth ----
    @POST("auth/otp/request")
    suspend fun requestOtp(@Body body: OtpRequest): OtpRequestResponse

    @POST("auth/otp/verify")
    suspend fun verifyOtp(@Body body: OtpVerify): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("auth/refresh")
    suspend fun refresh(@Body body: RefreshRequest): TokenPairDto

    @POST("auth/logout")
    suspend fun logout(@Body body: RefreshRequest): MessageResponse

    // -------------------------------------------------------- library ----
    @GET("library/pdfs")
    suspend fun libraryPdfs(
        @Query("search") search: String? = null,
        @Query("categoryId") categoryId: String? = null,
        @Query("subjectId") subjectId: String? = null,
        @Query("chapterId") chapterId: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 20,
    ): PagedPdfs

    @GET("library/tree")
    suspend fun libraryTree(): List<CategoryNode>

    /**
     * The secure access gate. Returns a short-lived presigned URL
     * (5 min for PDFs). Never exposes the storage key.
     */
    @POST("pdfs/{id}/access")
    suspend fun pdfAccess(@Path("id") id: String): AccessResponse

    // --------------------------------------------------------- videos ----
    @GET("library/videos")
    suspend fun libraryVideos(
        @Query("search") search: String? = null,
        @Query("categoryId") categoryId: String? = null,
        @Query("subjectId") subjectId: String? = null,
        @Query("chapterId") chapterId: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 50,
    ): PagedVideos

    /**
     * The secure video gate. Returns the authorized HLS master-manifest URL
     * ({BASE_URL}/videos/{id}/manifest). The player fetches the master with
     * the Bearer <redacted> variant sub-requests carry a short-lived HMAC
     * token instead. Never exposes storage keys.
     */
    @POST("videos/{id}/access")
    suspend fun videoAccess(@Path("id") id: String): AccessResponse

    // -------------------------------------------------------- banners ----
    @GET("banners")
    suspend fun banners(): List<BannerDto>

    // -------------------------------------------------------- devices ----
    @GET("devices")
    suspend fun myDevices(): List<DeviceDto>

    // -------------------------------------------------------- settings ----
    /** Public feature flags (screenshot/recording protection, watermark). */
    @GET("settings")
    suspend fun publicSettings(): SettingsResponse

    // ------------------------------------------------------- analytics ----
    /**
     * Batched analytics upload (Stage 6). JWT-guarded, throttled ~60/min.
     * Events are collected locally and flushed by AnalyticsUploadWorker
     * every 15 minutes — this endpoint is never called from the UI thread.
     */
    @POST("analytics/events")
    suspend fun reportEvents(@Body body: AnalyticsEventBatch): AnalyticsIngestResponse
}
