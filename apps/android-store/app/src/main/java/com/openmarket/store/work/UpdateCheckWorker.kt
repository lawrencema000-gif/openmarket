package com.openmarket.store.work

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.openmarket.store.MainActivity
import com.openmarket.store.R
import com.openmarket.store.data.api.models.PackageVersion
import com.openmarket.store.data.api.models.UpdateCheckRequest
import com.openmarket.store.data.local.InstalledAppsDao
import com.openmarket.store.data.repository.AppRepository
import com.openmarket.store.data.repository.DeviceRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/**
 * Periodic background update check.
 *
 * Sends every OpenMarket-installed package + version to
 * POST /api/device/update-check (one round trip), records which apps
 * have a newer release rolled out to this device, and posts a
 * notification. Downloads/installs stay user-initiated — a third-party
 * store can't silently update on stock Android anyway, so the honest UX
 * is notify → tap → confirm.
 */
@HiltWorker
class UpdateCheckWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: InstalledAppsDao,
    private val repository: AppRepository,
    private val deviceRepository: DeviceRepository,
) : CoroutineWorker(appContext, params) {

    companion object {
        const val WORK_NAME = "openmarket-update-check"
        private const val CHANNEL_ID = "app_updates"
        private const val NOTIFICATION_ID = 1001
    }

    override suspend fun doWork(): Result {
        val installed = dao.getAllInstalledAppsOnce()
        if (installed.isEmpty()) return Result.success()

        val response = repository.checkUpdates(
            UpdateCheckRequest(
                deviceId = deviceRepository.deviceId(),
                packages = installed.map { PackageVersion(it.packageName, it.versionCode) },
            ),
        ).getOrElse { return Result.retry() }

        var newlyAvailable = 0
        val updatedPackages = response.updates.associateBy { it.packageName }
        for (app in installed) {
            val update = updatedPackages[app.packageName]
            if (update != null && update.versionCode > app.versionCode) {
                if (app.availableVersionCode != update.versionCode) newlyAvailable++
                dao.markUpdateAvailable(app.packageName, update.versionCode, update.versionName)
            } else if (app.availableVersionCode != null) {
                dao.clearUpdateAvailable(app.packageName)
            }
        }

        if (newlyAvailable > 0) notifyUpdatesAvailable(newlyAvailable)
        return Result.success()
    }

    private fun notifyUpdatesAvailable(count: Int) {
        if (
            ContextCompat.checkSelfPermission(
                applicationContext,
                Manifest.permission.POST_NOTIFICATIONS,
            ) != PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val manager = NotificationManagerCompat.from(applicationContext)
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "App updates",
                NotificationManager.IMPORTANCE_DEFAULT,
            ),
        )

        val tapIntent = PendingIntent.getActivity(
            applicationContext,
            0,
            Intent(applicationContext, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(applicationContext, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(if (count == 1) "1 app update available" else "$count app updates available")
            .setContentText("Open OpenMarket to review and install updates.")
            .setContentIntent(tapIntent)
            .setAutoCancel(true)
            .build()

        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }
}
