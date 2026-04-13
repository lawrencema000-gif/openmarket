package com.openmarket.store.ui.screens.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openmarket.store.data.api.models.AppCardData
import com.openmarket.store.data.repository.AppRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SearchUiState(
    val query: String = "",
    val selectedCategory: String? = null,
    val results: List<AppCardData> = emptyList(),
    val totalHits: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val repository: AppRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState

    private val queryFlow = MutableStateFlow("")

    init {
        @OptIn(FlowPreview::class)
        viewModelScope.launch {
            queryFlow
                .debounce(300)
                .distinctUntilChanged()
                .collect { query ->
                    performSearch(query, _uiState.value.selectedCategory)
                }
        }
    }

    fun onQueryChange(query: String) {
        _uiState.value = _uiState.value.copy(query = query)
        queryFlow.value = query
    }

    fun onCategorySelect(category: String?) {
        _uiState.value = _uiState.value.copy(selectedCategory = category)
        performSearch(_uiState.value.query, category)
    }

    fun search() {
        performSearch(_uiState.value.query, _uiState.value.selectedCategory)
    }

    private fun performSearch(query: String, category: String?) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            val result = repository.searchApps(query, category)
            result.fold(
                onSuccess = { response ->
                    _uiState.value = _uiState.value.copy(
                        results = response.hits,
                        totalHits = response.totalHits,
                        isLoading = false,
                    )
                },
                onFailure = { error ->
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = error.message,
                    )
                }
            )
        }
    }
}
