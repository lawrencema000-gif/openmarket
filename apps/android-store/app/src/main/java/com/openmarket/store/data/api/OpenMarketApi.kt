package com.openmarket.store.data.api

import com.openmarket.store.data.api.models.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*
import io.ktor.http.*

class OpenMarketApi(
    private val client: HttpClient,
    private val baseUrl: String,
) {
    suspend fun getCategories(): List<CategoryResponse> {
        return client.get("$baseUrl/api/categories").body()
    }

    suspend fun searchApps(
        query: String,
        category: String? = null,
        page: Int = 1,
        limit: Int = 20,
    ): SearchResponse {
        return client.get("$baseUrl/api/search") {
            parameter("q", query)
            category?.let { parameter("category", it) }
            parameter("page", page)
            parameter("limit", limit)
        }.body()
    }

    suspend fun getApp(id: String): AppDetailResponse {
        return client.get("$baseUrl/api/apps/$id").body()
    }

    suspend fun getAppReleases(appId: String): List<ReleaseResponse> {
        return client.get("$baseUrl/api/apps/$appId/releases").body()
    }

    suspend fun getAppReviews(appId: String): List<ReviewResponse> {
        return client.get("$baseUrl/api/apps/$appId/reviews").body()
    }

    // ───────── Device delivery (anonymous, rollout-gated) ─────────

    /** Which release should THIS device install right now? */
    suspend fun getInstallInfo(appId: String, deviceId: String): InstallInfo {
        return client.get("$baseUrl/api/device/apps/$appId/install-info") {
            parameter("deviceId", deviceId)
        }.body()
    }

    /** Short-lived signed download URL for a verified APK artifact. */
    suspend fun getDownloadUrl(artifactId: String, deviceId: String): DownloadUrlResponse {
        return client.get("$baseUrl/api/device/artifacts/$artifactId/download-url") {
            parameter("deviceId", deviceId)
        }.body()
    }

    /** Batch update check for every OpenMarket-installed package. */
    suspend fun checkUpdates(request: UpdateCheckRequest): UpdateCheckResponse {
        return client.post("$baseUrl/api/device/update-check") {
            contentType(ContentType.Application.Json)
            setBody(request)
        }.body()
    }

    /**
     * Record a completed install in the signed-in user's library.
     * Requires auth — callers treat failures (incl. 401 when signed
     * out) as best-effort.
     */
    suspend fun recordInstall(appId: String, versionCode: Int, deviceId: String) {
        client.post("$baseUrl/api/users/me/library/$appId") {
            contentType(ContentType.Application.Json)
            setBody(RecordInstallRequest(versionCode = versionCode, deviceFingerprintHash = deviceId))
        }
    }
}
