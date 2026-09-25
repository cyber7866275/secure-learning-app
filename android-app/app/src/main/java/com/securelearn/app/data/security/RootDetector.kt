package com.securelearn.app.data.security

import android.content.Context
import com.scottyab.rootbeer.RootBeer
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Root detection wrapper (Stage 7).
 *
 * Uses RootBeer heuristics (su binary, build tags, known root apps, etc.).
 * The result is computed once per process and cached — the check is not
 * free, and root status doesn't change while the app runs.
 *
 * Honest limitation: this is a *client-side self-report*. A tampered app can
 * lie about the result, which is why the server treats the `rooted` flag as
 * a signal (alert + optional block) and Play Integrity is the
 * hardware-backed counterpart. A detector crash never blocks the user.
 */
@Singleton
class RootDetector @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    @Volatile
    private var cached: Boolean? = null

    fun isRooted(): Boolean {
        cached?.let { return it }
        val result = try {
            RootBeer(context).isRooted
        } catch (_: Exception) {
            false
        }
        cached = result
        return result
    }
}
