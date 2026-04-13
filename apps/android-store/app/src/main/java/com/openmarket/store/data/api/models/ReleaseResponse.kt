package com.openmarket.store.data.api.models

import kotlinx.serialization.Serializable

@Serializable
data class ReleaseResponse(
    val id: String,
    val appId: String,
    val versionCode: Int,
    val versionName: String,
    val channel: String,
    val status: String,
    val rolloutPercentage: Int = 100,
    val releaseNotes: String? = null,
    val publishedAt: String? = null,
    val createdAt: String,
)

@Serializable
data class ReviewResponse(
    val id: String,
    val appId: String,
    val userId: String,
    val rating: Int,
    val title: String? = null,
    val body: String? = null,
    val versionCodeReviewed: Int,
    val createdAt: String,
)
