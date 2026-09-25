package com.securelearn.app.data.repository

import com.securelearn.app.data.remote.ApiService
import com.securelearn.app.di.AuthClient
import javax.inject.Singleton

/** Content reads. Uses the authenticated ApiService (Bearer token). */
@Singleton
class ContentRepository constructor(
    @AuthClient private val api: ApiService,
) {
    suspend fun libraryPdfs(
        search: String? = null,
        categoryId: String? = null,
        subjectId: String? = null,
        chapterId: String? = null,
        page: Int = 1,
        limit: Int = 20,
    ) = api.libraryPdfs(search, categoryId, subjectId, chapterId, page, limit)

    suspend fun libraryTree() = api.libraryTree()

    /** Secure gate: server checks permission, returns a 5-min presigned URL. */
    suspend fun requestPdfAccess(pdfId: String) = api.pdfAccess(pdfId)

    suspend fun libraryVideos(
        search: String? = null,
        categoryId: String? = null,
        subjectId: String? = null,
        chapterId: String? = null,
    ) = api.libraryVideos(search, categoryId, subjectId, chapterId)

    /**
     * Secure video gate: server checks permission and returns the authorized
     * HLS master-manifest URL (NOT a direct file URL — there is none).
     */
    suspend fun requestVideoAccess(videoId: String) = api.videoAccess(videoId)

    suspend fun banners() = api.banners()
}
