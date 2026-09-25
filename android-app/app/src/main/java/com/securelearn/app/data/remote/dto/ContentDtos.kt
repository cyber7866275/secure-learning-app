package com.securelearn.app.data.remote.dto

/** Mirrors backend content/library/banner/device/settings shapes. */
data class TaxonomyRef(
    val id: String,
    val name: String,
)

data class PdfItem(
    val id: String,
    val title: String,
    val pageCount: Int?,
    val category: TaxonomyRef?,
    val subject: TaxonomyRef?,
    val chapter: TaxonomyRef?,
    val createdAt: String,
)

data class PagedPdfs(
    val data: List<PdfItem>,
    val total: Int,
    val page: Int,
    val limit: Int,
)

data class VideoItem(
    val id: String,
    val title: String,
    val durationSec: Int?,
    val category: TaxonomyRef?,
    val subject: TaxonomyRef?,
    val chapter: TaxonomyRef?,
    val createdAt: String,
)

data class PagedVideos(
    val data: List<VideoItem>,
    val total: Int,
    val page: Int,
    val limit: Int,
)

data class ChapterNode(
    val id: String,
    val name: String,
    val itemCount: Int,
)

data class SubjectNode(
    val id: String,
    val name: String,
    val itemCount: Int,
    val chapters: List<ChapterNode>,
)

data class CategoryNode(
    val id: String,
    val name: String,
    val type: String,
    val itemCount: Int,
    val subjects: List<SubjectNode>,
)

data class AccessResponse(
    val url: String,
    val expiresInSec: Int,
)

data class BannerDto(
    val id: String,
    val title: String,
    val body: String?,
    val imageKey: String?,
    val active: Boolean,
    val sortOrder: Int,
)

data class DeviceDto(
    val id: String,
    val fingerprint: String,
    val name: String?,
    val ip: String?,
    val lastSeenAt: String,
    val revoked: Boolean,
    val createdAt: String,
)

data class SettingsResponse(
    val settings: Map<String, String>,
)

/** Backend error envelope: { message, error, statusCode }. */
data class ErrorEnvelope(
    val message: Any?,
    val error: String?,
    val statusCode: Int?,
)
