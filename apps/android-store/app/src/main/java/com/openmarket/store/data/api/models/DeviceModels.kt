package com.openmarket.store.data.api.models

import kotlinx.serialization.Serializable

/**
 * Shapes for the anonymous device-delivery endpoints
 * (the /api/device routes on the OpenMarket API).
 */

@Serializable
data class InstallInfo(
    val appId: String,
    val packageName: String,
    val releaseId: String,
    val versionCode: Int,
    val versionName: String,
    val releaseNotes: String? = null,
    val artifactId: String,
    val fileSize: Long? = null,
    val sha256: String? = null,
)

@Serializable
data class DownloadUrlResponse(
    val url: String,
    val expiresInSeconds: Int = 300,
    val sha256: String? = null,
    val fileSize: Long? = null,
)

@Serializable
data class PackageVersion(
    val packageName: String,
    val versionCode: Int,
)

@Serializable
data class UpdateCheckRequest(
    val deviceId: String,
    val packages: List<PackageVersion>,
)

@Serializable
data class UpdateCheckResponse(
    val updates: List<InstallInfo> = emptyList(),
    val checkedAt: String? = null,
)

/** Body for POST /users/me/library/:appId (install recording). */
@Serializable
data class RecordInstallRequest(
    val versionCode: Int,
    val source: String = "store_app",
    val deviceFingerprintHash: String? = null,
)
