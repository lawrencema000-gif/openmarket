package com.openmarket.store.installer

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.isActive
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton

sealed class DownloadState {
    /** progress is null while the server hasn't told us a content length. */
    data class Downloading(val progress: Float?) : DownloadState()
    data object Verifying : DownloadState()
    data class Complete(val file: File) : DownloadState()
    data class Failed(val error: String) : DownloadState()
}

@Singleton
class DownloadManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    /**
     * Download an APK to app-private storage, then verify its SHA-256
     * against the marketplace-recorded digest. A mismatched digest is a
     * hard failure — the file is deleted, never handed to the installer.
     */
    fun downloadApk(
        url: String,
        expectedSha256: String,
        fileName: String,
    ): Flow<DownloadState> = callbackFlow {
        // App-private internal storage, NOT getExternalFilesDir(): on
        // API 26-29 external app dirs are readable/writable by any app
        // holding WRITE_EXTERNAL_STORAGE, opening a TOCTOU window between
        // our SHA-256 verify and the installer streaming the bytes. cacheDir
        // is truly private; we delete the file right after install anyway.
        val apkDir = File(context.cacheDir, "apks")
        val outputFile = File(apkDir, fileName)
        try {
            send(DownloadState.Downloading(null))
            apkDir.mkdirs()

            val connection = URL(url).openConnection() as HttpURLConnection
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            connection.instanceFollowRedirects = true
            try {
                val code = connection.responseCode
                if (code !in 200..299) throw IOException("Download failed with HTTP $code")

                val totalSize = connection.contentLengthLong
                var downloaded = 0L
                var lastPercent = -1

                connection.inputStream.use { input ->
                    outputFile.outputStream().use { output ->
                        val buffer = ByteArray(64 * 1024)
                        while (isActive) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            output.write(buffer, 0, read)
                            downloaded += read
                            if (totalSize > 0) {
                                val percent = ((downloaded * 100) / totalSize).toInt()
                                if (percent != lastPercent) {
                                    lastPercent = percent
                                    trySend(DownloadState.Downloading(percent / 100f))
                                }
                            }
                        }
                    }
                }
                if (totalSize > 0 && downloaded != totalSize) {
                    throw IOException("Connection dropped mid-download ($downloaded/$totalSize bytes)")
                }
            } finally {
                connection.disconnect()
            }

            send(DownloadState.Verifying)
            val sha256 = computeSha256(outputFile)
            if (sha256.equals(expectedSha256, ignoreCase = true)) {
                send(DownloadState.Complete(outputFile))
            } else {
                outputFile.delete()
                send(DownloadState.Failed("Checksum mismatch — the download was corrupted or tampered with"))
            }
        } catch (e: CancellationException) {
            outputFile.delete()
            throw e
        } catch (e: Exception) {
            outputFile.delete()
            send(DownloadState.Failed(e.message ?: "Download failed"))
        } finally {
            close()
        }
        awaitClose { }
    }.flowOn(Dispatchers.IO)

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(64 * 1024)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
