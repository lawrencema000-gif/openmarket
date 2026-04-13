package com.openmarket.store.ui.screens.myapps

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

data class InstalledAppUi(
    val packageName: String,
    val appId: String,
    val title: String,
    val versionName: String,
    val iconUrl: String,
)

data class MyAppsUiState(
    val installedApps: List<InstalledAppUi> = emptyList(),
    val isLoading: Boolean = false,
)

@HiltViewModel
class MyAppsViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(MyAppsUiState())
    val uiState: StateFlow<MyAppsUiState> = _uiState
}
