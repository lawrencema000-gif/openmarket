package com.openmarket.store.installer

import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.pm.PackageInfoCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Reads the DEVICE's real package state via PackageManager.
 *
 * This is the source of truth for "is this app installed, and at what
 * version" — not the Room mirror, which can drift when the user installs
 * an update, uninstalls outside the store, or when our process was killed
 * mid-install and never recorded the result. Every install-state decision
 * consults the device first; Room is just a cache + the update-chip hint.
 */
@Singleton
class InstalledPackages @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    /** Installed versionCode for a package, or null if not installed. */
    fun installedVersionCode(packageName: String): Long? {
        return try {
            val info = context.packageManager.getPackageInfo(packageName, 0)
            PackageInfoCompat.getLongVersionCode(info)
        } catch (_: PackageManager.NameNotFoundException) {
            null
        }
    }

    fun isInstalled(packageName: String): Boolean =
        installedVersionCode(packageName) != null
}
