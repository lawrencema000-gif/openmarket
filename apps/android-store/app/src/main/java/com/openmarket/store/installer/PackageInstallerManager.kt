package com.openmarket.store.installer

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PackageInstallerManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {

    companion object {
        /**
         * The system confirmation dialog can sit unanswered for a long
         * time; 10 minutes covers a distracted user without leaking the
         * awaiting coroutine forever.
         */
        private const val RESULT_TIMEOUT_MS = 10L * 60L * 1000L
    }

    /** minSdk is 26, so canRequestPackageInstalls() always exists. */
    fun canInstallPackages(): Boolean =
        context.packageManager.canRequestPackageInstalls()

    /** Settings screen where the user grants us "install unknown apps". */
    fun unknownSourcesIntent(): Intent =
        Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"),
        )

    /**
     * Stream the APK into a PackageInstaller session, commit it, and
     * suspend until the terminal result comes back through
     * [InstallResultReceiver]. The system confirmation dialog (mandatory
     * for a sideload store) is launched by the receiver on
     * STATUS_PENDING_USER_ACTION — this call keeps waiting through it.
     */
    suspend fun install(apkFile: File, packageName: String): InstallResult {
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL,
        ).apply {
            setAppPackageName(packageName)
            setSize(apkFile.length())
            setInstallReason(PackageManager.INSTALL_REASON_USER)
        }

        val sessionId = installer.createSession(params)
        try {
            // Subscribe to the result flow BEFORE committing. The
            // PackageInstaller status broadcast (and the resulting
            // InstallEvents emission) can arrive the instant commit()
            // returns; MutableSharedFlow(replay=0) drops emissions with no
            // active subscriber, so subscribing after commit races the
            // broadcast and would hang for the full timeout. Starting the
            // collector UNDISPATCHED guarantees it's live before commit.
            return coroutineScope {
                val waiter = async(start = CoroutineStart.UNDISPATCHED) {
                    InstallEvents.results.first { it.sessionId == sessionId }
                }

                withContext(Dispatchers.IO) {
                    installer.openSession(sessionId).use { session ->
                        session.openWrite("base.apk", 0, apkFile.length()).use { output ->
                            apkFile.inputStream().use { input -> input.copyTo(output) }
                            session.fsync(output)
                        }

                        val statusIntent = Intent(context, InstallResultReceiver::class.java)
                            .setAction(InstallResultReceiver.ACTION_INSTALL_STATUS)
                            .setPackage(context.packageName)
                        // FLAG_MUTABLE is required: PackageInstaller appends
                        // the status extras (and the confirmation intent).
                        val pendingIntent = PendingIntent.getBroadcast(
                            context,
                            sessionId,
                            statusIntent,
                            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
                        )
                        session.commit(pendingIntent.intentSender)
                    }
                }

                withTimeout(RESULT_TIMEOUT_MS) { waiter.await() }
            }
        } catch (e: Exception) {
            runCatching { installer.abandonSession(sessionId) }
            if (e is kotlinx.coroutines.TimeoutCancellationException) {
                return InstallResult(sessionId, false, "Install timed out waiting for confirmation")
            }
            throw e
        }
    }
}
