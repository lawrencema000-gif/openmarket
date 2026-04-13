package com.openmarket.store.data.api

import com.openmarket.store.data.api.models.*
import io.ktor.client.*
import io.ktor.client.call.*
import io.ktor.client.request.*

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
}
