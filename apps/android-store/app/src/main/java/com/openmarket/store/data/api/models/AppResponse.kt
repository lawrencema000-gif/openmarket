package com.openmarket.store.data.api.models

import kotlinx.serialization.Serializable

@Serializable
data class AppDetailResponse(
    val id: String,
    val packageName: String,
    val developerId: String,
    val trustTier: String,
    val isPublished: Boolean,
    val isDelisted: Boolean,
    val createdAt: String,
    val listing: AppListing? = null,
    val developer: DeveloperInfo? = null,
)

@Serializable
data class AppListing(
    val id: String,
    val title: String,
    val shortDescription: String,
    val fullDescription: String,
    val category: String,
    val iconUrl: String,
    val screenshots: List<String>? = null,
    val isExperimental: Boolean = false,
    val containsAds: Boolean = false,
    val contentRating: String? = null,
)

@Serializable
data class DeveloperInfo(
    val id: String,
    val displayName: String,
    val trustLevel: String,
)

@Serializable
data class AppCardData(
    val id: String,
    val packageName: String,
    val title: String,
    val shortDescription: String,
    val category: String,
    val iconUrl: String,
    val developerName: String,
    val trustTier: String,
    val isExperimental: Boolean,
)
