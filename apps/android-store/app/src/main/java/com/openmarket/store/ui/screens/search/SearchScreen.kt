package com.openmarket.store.ui.screens.search

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.openmarket.store.ui.components.AppCard
import com.openmarket.store.ui.components.CategoryChip
import com.openmarket.store.ui.components.OpenMarketSearchBar

val CATEGORIES = listOf("All", "Productivity", "Games", "Social", "Tools", "Entertainment", "Finance")

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SearchScreen(
    onAppClick: (String) -> Unit,
    viewModel: SearchViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 16.dp),
    ) {
        Spacer(Modifier.height(16.dp))
        OpenMarketSearchBar(
            query = uiState.query,
            onQueryChange = viewModel::onQueryChange,
            onSearch = viewModel::search,
        )
        Spacer(Modifier.height(8.dp))

        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            items(CATEGORIES) { category ->
                val isSelected = when {
                    category == "All" -> uiState.selectedCategory == null
                    else -> uiState.selectedCategory == category.lowercase()
                }
                CategoryChip(
                    label = category,
                    selected = isSelected,
                    onClick = {
                        viewModel.onCategorySelect(
                            if (category == "All") null else category.lowercase()
                        )
                    },
                )
            }
        }

        Spacer(Modifier.height(8.dp))

        if (uiState.isLoading) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        } else if (uiState.error != null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(
                    text = "Error: ${uiState.error}",
                    color = MaterialTheme.colorScheme.error,
                )
            }
        } else if (uiState.results.isEmpty() && uiState.query.isNotEmpty()) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("No results found for \"${uiState.query}\"")
            }
        } else {
            if (uiState.results.isNotEmpty()) {
                Text(
                    text = "${uiState.totalHits} results",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Spacer(Modifier.height(8.dp))
            }
            LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(uiState.results) { app ->
                    AppCard(app = app, onClick = { onAppClick(app.id) })
                }
            }
        }
    }
}
