package com.openmarket.store.ui.screens.myapps

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openmarket.store.data.local.InstalledAppsDao
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import javax.inject.Inject

data class InstalledAppUi(
    val packageName: String,
    val appId: String,
    val title: String,
    val versionName: String,
    val iconUrl: String,
    val updateAvailable: Boolean,
    val availableVersionName: String?,
)

data class MyAppsUiState(
    val installedApps: List<InstalledAppUi> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class MyAppsViewModel @Inject constructor(
    dao: InstalledAppsDao,
) : ViewModel() {

    val uiState: StateFlow<MyAppsUiState> =
        dao.getAllInstalledApps()
            .map { entities ->
                MyAppsUiState(
                    installedApps = entities.map { e ->
                        InstalledAppUi(
                            packageName = e.packageName,
                            appId = e.appId,
                            title = e.title,
                            versionName = e.versionName,
                            iconUrl = e.iconUrl,
                            updateAvailable =
                                e.availableVersionCode != null && e.availableVersionCode > e.versionCode,
                            availableVersionName = e.availableVersionName,
                        )
                    },
                    isLoading = false,
                )
            }
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MyAppsUiState())
}
