package com.securelearn.app.domain.usecase

import com.securelearn.app.data.remote.dto.AccessResponse
import com.securelearn.app.data.repository.ContentRepository
import javax.inject.Inject

/**
 * Requests a short-lived presigned PDF URL through the secure access gate.
 * The backend enforces (in order): published status, device validity, and
 * the default-deny permission check before issuing the URL.
 */
class RequestPdfAccessUseCase @Inject constructor(
    private val contentRepository: ContentRepository,
) {
    suspend operator fun invoke(pdfId: String): Result<AccessResponse> =
        runCatching { contentRepository.requestPdfAccess(pdfId) }
}
