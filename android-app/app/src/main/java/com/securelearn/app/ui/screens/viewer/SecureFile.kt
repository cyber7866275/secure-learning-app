package com.securelearn.app.ui.screens.viewer

import java.io.File
import java.io.RandomAccessFile

/**
 * Overwrites a file's bytes with zeros before deleting it, so a decrypted
 * PDF never lingers in storage after the viewer closes. Best-effort: if the
 * overwrite fails we still attempt the delete.
 */
fun secureDelete(file: File) {
    try {
        if (file.exists() && file.isFile) {
            try {
                RandomAccessFile(file, "rw").use { raf ->
                    val zeros = ByteArray(8192)
                    var remaining = raf.length()
                    raf.seek(0)
                    while (remaining > 0) {
                        val n = minOf(zeros.size.toLong(), remaining).toInt()
                        raf.write(zeros, 0, n)
                        remaining -= n
                    }
                    raf.fd.sync()
                }
            } catch (_: Exception) {
                // Fall through to plain delete.
            }
            file.delete()
        }
    } catch (_: Exception) {
        // Never crash the app over cleanup.
    }
}
