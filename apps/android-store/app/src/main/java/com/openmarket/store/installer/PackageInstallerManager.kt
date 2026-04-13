package com.openmarket.store.installer

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.os.Build
import com.openmarket.store.MainActivity
import java.io.File
import java.io.FileInputStream

class PackageInstallerManager(private val context: Context) {

    fun canInstallPackages(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.packageManager.canRequestPackageInstalls()
        } else {
            true
        }
    }

    fun installApk(apkFile: File): Boolean {
        val packageInstaller = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(
            PackageInstaller.SessionParams.MODE_FULL_INSTALL
        )
        params.setSize(apkFile.length())

        val sessionId = packageInstaller.createSession(params)
        val session = packageInstaller.openSession(sessionId)

        session.openWrite("base.apk", 0, apkFile.length()).use { outputStream ->
            FileInputStream(apkFile).use { inputStream ->
                inputStream.copyTo(outputStream)
            }
            session.fsync(outputStream)
        }

        val intent = Intent(context, MainActivity::class.java)
        intent.action = "com.openmarket.store.INSTALL_RESULT"
        val pendingIntent = PendingIntent.getActivity(
            context, sessionId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )

        session.commit(pendingIntent.intentSender)
        session.close()

        return true
    }
}
