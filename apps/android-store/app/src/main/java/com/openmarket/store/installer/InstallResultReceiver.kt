package com.openmarket.store.installer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build

/**
 * Receives PackageInstaller session status broadcasts.
 *
 * A third-party store on stock Android can never install silently: the
 * first commit always comes back as STATUS_PENDING_USER_ACTION carrying
 * the system confirmation dialog intent, which we launch here. After the
 * user confirms or cancels, the installer fires this receiver again with
 * a terminal status that we forward to [InstallEvents].
 */
class InstallResultReceiver : BroadcastReceiver() {

    companion object {
        const val ACTION_INSTALL_STATUS = "com.openmarket.store.INSTALL_STATUS"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION_INSTALL_STATUS) return

        val status = intent.getIntExtra(
            PackageInstaller.EXTRA_STATUS,
            PackageInstaller.STATUS_FAILURE,
        )
        val sessionId = intent.getIntExtra(PackageInstaller.EXTRA_SESSION_ID, -1)

        when (status) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirmIntent: Intent? =
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(Intent.EXTRA_INTENT)
                    }
                if (confirmIntent == null) {
                    InstallEvents.tryEmit(
                        InstallResult(sessionId, false, "System did not provide a confirmation dialog"),
                    )
                    return
                }
                confirmIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                runCatching { context.startActivity(confirmIntent) }.onFailure {
                    InstallEvents.tryEmit(
                        InstallResult(sessionId, false, "Could not show the system install prompt"),
                    )
                }
            }

            PackageInstaller.STATUS_SUCCESS ->
                InstallEvents.tryEmit(InstallResult(sessionId, true, null))

            else -> {
                val systemMessage = intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)
                InstallEvents.tryEmit(
                    InstallResult(sessionId, false, friendlyMessage(status, systemMessage)),
                )
            }
        }
    }

    private fun friendlyMessage(status: Int, systemMessage: String?): String =
        when (status) {
            PackageInstaller.STATUS_FAILURE_ABORTED -> "Install cancelled"
            PackageInstaller.STATUS_FAILURE_BLOCKED -> "Install blocked by the system"
            PackageInstaller.STATUS_FAILURE_CONFLICT ->
                "Conflicts with an existing app (different signing key?)"
            PackageInstaller.STATUS_FAILURE_INCOMPATIBLE -> "App is not compatible with this device"
            PackageInstaller.STATUS_FAILURE_INVALID -> "APK is invalid or corrupted"
            PackageInstaller.STATUS_FAILURE_STORAGE -> "Not enough storage space"
            else -> systemMessage ?: "Install failed"
        }
}
