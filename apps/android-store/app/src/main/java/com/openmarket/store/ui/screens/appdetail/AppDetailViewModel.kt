package com.openmarket.store.ui.screens.appdetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.openmarket.store.data.api.models.AppDetailResponse
import com.openmarket.store.data.api.models.ReleaseResponse
import com.openmarket.store.data.api.models.ReviewResponse
import com.openmarket.store.data.repository.AppRepository
import com.openmarket.store.ui.navigation.AppDetailRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AppDetailUiState(
    val app: AppDetailResponse? = null,
    val releases: List<ReleaseResponse> = emptyList(),
    val reviews: List<ReviewResponse> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val installState: InstallState = InstallState.Idle,
)

sealed class InstallState {
    data object Idle : InstallState()
    data class Downloading(val progress: Float) : InstallState()
    data object Installing : InstallState()
    data object Installed : InstallState()
    data class Failed(val error: String) : InstallState()
}

@HiltViewModel
class AppDetailViewModel @Inject constructor(
    private val repository: AppRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val route = savedStateHandle.toRoute<AppDetailRoute>()
    private val appId = route.appId

    private val _uiState = MutableStateFlow(AppDetailUiState())
    val uiState: StateFlow<AppDetailUiState> = _uiState

    init {
        loadAppDetail()
    }

    fun loadAppDetail() {
        viewModelScope.launch {
            _uiState.value = AppDetailUiState(isLoading = true)

            val appResult = repository.getApp(appId)
            val releasesResult = repository.getAppReleases(appId)
            val reviewsResult = repository.getAppReviews(appId)

            _uiState.value = AppDetailUiState(
                app = appResult.getOrNull(),
                releases = releasesResult.getOrElse { emptyList() },
                reviews = reviewsResult.getOrElse { emptyList() },
                isLoading = false,
                error = appResult.exceptionOrNull()?.message,
            )
        }
    }

    fun install() {
        // Placeholder — real install wires into DownloadManager + PackageInstallerManager
        _uiState.value = _uiState.value.copy(installState = InstallState.Downloading(0f))
        viewModelScope.launch {
            kotlinx.coroutines.delay(1500)
            _uiState.value = _uiState.value.copy(installState = InstallState.Installing)
            kotlinx.coroutines.delay(1000)
            _uiState.value = _uiState.value.copy(installState = InstallState.Installed)
        }
    }
}
