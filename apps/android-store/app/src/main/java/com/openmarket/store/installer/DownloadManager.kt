package com.openmarket.store.installer

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.withContext
import java.io.File
import java.net.URL
import java.security.MessageDigest

sealed class DownloadState {
    data object Idle : DownloadState()
    data class Downloading(val progress: Float) : DownloadState()
    data class Verifying(val progress: Float = 1f) : DownloadState()
    data class Complete(val file: File) : DownloadState()
    data class Failed(val error: String) : DownloadState()
}

class DownloadManager(private val context: Context) {

    fun downloadApk(
        url: String,
        expectedSha256: String,
        fileName: String,
    ): Flow<DownloadState> = flow {
        emit(DownloadState.Downloading(0f))

        try {
            val file = withContext(Dispatchers.IO) {
                val outputFile = File(context.getExternalFilesDir("apks"), fileName)
                outputFile.parentFile?.mkdirs()

                val connection = URL(url).openConnection()
                val totalSize = connection.contentLengthLong
                var downloaded = 0L

                connection.getInputStream().use { input ->
                    outputFile.outputStream().use { output ->
                        val buffer = ByteArray(8192)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } != -1) {
                            output.write(buffer, 0, bytesRead)
                            downloaded += bytesRead
                        }
                    }
                }
                outputFile
            }

            emit(DownloadState.Verifying())

            val sha256 = withContext(Dispatchers.IO) {
                computeSha256(file)
            }

            if (sha256.equals(expectedSha256, ignoreCase = true)) {
                emit(DownloadState.Complete(file))
            } else {
                file.delete()
                emit(DownloadState.Failed("SHA-256 verification failed"))
            }
        } catch (e: Exception) {
            emit(DownloadState.Failed(e.message ?: "Download failed"))
        }
    }

    private fun computeSha256(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buffer = ByteArray(8192)
            var bytesRead: Int
            while (input.read(buffer).also { bytesRead = it } != -1) {
                digest.update(buffer, 0, bytesRead)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }
}
