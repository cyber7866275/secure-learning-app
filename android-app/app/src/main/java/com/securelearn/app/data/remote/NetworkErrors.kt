package com.securelearn.app.data.remote

import com.google.gson.Gson
import com.securelearn.app.data.remote.dto.ErrorEnvelope
import retrofit2.HttpException
import java.io.IOException

/** Human-readable message from any network failure. */
fun userMessage(t: Throwable): String = when (t) {
    is HttpException -> httpErrorMessage(t)
    is IOException -> "Network error. Please check your connection and try again."
    else -> t.message?.takeIf { it.isNotBlank() } ?: "Something went wrong. Please try again."
}

private val gson = Gson()

private fun httpErrorMessage(e: HttpException): String {
    val fallback = when (e.code()) {
        400 -> "Invalid request. Please check the details."
        401 -> "Session expired. Please log in again."
        403 -> "You don't have access to this content."
        404 -> "Not found."
        409 -> "Already exists."
        429 -> "Too many attempts. Please wait a minute and try again."
        in 500..599 -> "Server error. Please try again later."
        else -> "Request failed. Please try again."
    }
    return try {
        val body = e.response()?.errorBody()?.string() ?: return fallback
        val env = gson.fromJson(body, ErrorEnvelope::class.java) ?: return fallback
        when (val m = env.message) {
            is String -> m.takeIf { it.isNotBlank() } ?: fallback
            is List<*> -> m.filterIsInstance<String>().firstOrNull() ?: fallback
            else -> fallback
        }
    } catch (_: Exception) {
        fallback
    }
}

/** True when the failure is an HTTP 403 (e.g. an expired presigned URL). */
fun isForbidden(t: Throwable): Boolean = (t as? HttpException)?.code() == 403
