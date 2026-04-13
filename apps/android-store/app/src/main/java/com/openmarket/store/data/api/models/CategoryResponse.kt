package com.openmarket.store.data.api.models

import kotlinx.serialization.Serializable

@Serializable
data class CategoryResponse(
    val id: String,
    val slug: String,
    val name: String,
    val icon: String? = null,
    val sortOrder: Int = 0,
)
