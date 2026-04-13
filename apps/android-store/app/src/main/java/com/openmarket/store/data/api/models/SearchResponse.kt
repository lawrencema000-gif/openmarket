package com.openmarket.store.data.api.models

import kotlinx.serialization.Serializable

@Serializable
data class SearchResponse(
    val hits: List<AppCardData>,
    val totalHits: Int = 0,
    val page: Int = 1,
    val limit: Int = 20,
    val processingTimeMs: Int = 0,
)
