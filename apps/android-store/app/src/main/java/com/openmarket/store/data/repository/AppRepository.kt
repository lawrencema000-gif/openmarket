package com.openmarket.store.data.repository

import com.openmarket.store.data.api.OpenMarketApi
import com.openmarket.store.data.api.models.*

class AppRepository(private val api: OpenMarketApi) {

    suspend fun getCategories(): Result<List<CategoryResponse>> = runCatching {
        api.getCategories()
    }

    suspend fun searchApps(
        query: String,
        category: String? = null,
        page: Int = 1,
    ): Result<SearchResponse> = runCatching {
        api.searchApps(query, category, page)
    }

    suspend fun getApp(id: String): Result<AppDetailResponse> = runCatching {
        api.getApp(id)
    }

    suspend fun getAppReleases(appId: String): Result<List<ReleaseResponse>> = runCatching {
        api.getAppReleases(appId)
    }

    suspend fun getAppReviews(appId: String): Result<List<ReviewResponse>> = runCatching {
        api.getAppReviews(appId)
    }

    suspend fun getInstallInfo(appId: String, deviceId: String): Result<InstallInfo> = runCatching {
        api.getInstallInfo(appId, deviceId)
    }

    suspend fun getDownloadUrl(artifactId: String, deviceId: String): Result<DownloadUrlResponse> =
        runCatching { api.getDownloadUrl(artifactId, deviceId) }

    suspend fun checkUpdates(request: UpdateCheckRequest): Result<UpdateCheckResponse> =
        runCatching { api.checkUpdates(request) }

    /** Best-effort: requires a signed-in session; failures are swallowed upstream. */
    suspend fun recordInstall(appId: String, versionCode: Int, deviceId: String): Result<Unit> =
        runCatching { api.recordInstall(appId, versionCode, deviceId) }
}
