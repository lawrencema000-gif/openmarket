package com.openmarket.store.ui.screens.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openmarket.store.data.api.models.AppCardData
import com.openmarket.store.data.api.models.CategoryResponse
import com.openmarket.store.data.repository.AppRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val categories: List<CategoryResponse> = emptyList(),
    val featuredApps: List<AppCardData> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val repository: AppRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState(isLoading = true))
    val uiState: StateFlow<HomeUiState> = _uiState

    init {
        loadHome()
    }

    fun loadHome() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            val categoriesResult = repository.getCategories()
            val searchResult = repository.searchApps("", page = 1)

            _uiState.value = HomeUiState(
                categories = categoriesResult.getOrElse { emptyList() },
                featuredApps = searchResult.getOrElse { null }?.hits ?: emptyList(),
                isLoading = false,
                error = categoriesResult.exceptionOrNull()?.message,
            )
        }
    }
}
