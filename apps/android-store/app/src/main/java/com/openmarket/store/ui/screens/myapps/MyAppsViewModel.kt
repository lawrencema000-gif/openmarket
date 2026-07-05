package com.openmarket.store.ui.screens.myapps

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.openmarket.store.data.local.InstalledAppsDao
import com.openmarket.store.installer.InstalledPackages
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOn
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
    private val installedPackages: InstalledPackages,
) : ViewModel() {

    val uiState: StateFlow<MyAppsUiState> =
        dao.getAllInstalledApps()
            .map { entities ->
                // Reconcile against the DEVICE, not just the Room mirror: an
                // app the user uninstalled elsewhere must drop off this list,
                // and the "update available" chip must compare against the
                // REAL installed version (Room's versionCode goes stale if the
                // app was updated outside the store).
                val installed = entities.mapNotNull { e ->
                    val realVersion = installedPackages.installedVersionCode(e.packageName)
                        ?: return@mapNotNull null
                    val available = e.availableVersionCode
                    InstalledAppUi(
                        packageName = e.packageName,
                        appId = e.appId,
                        title = e.title,
                        versionName = e.versionName,
                        iconUrl = e.iconUrl,
                        updateAvailable = available != null && available > realVersion,
                        availableVersionName = e.availableVersionName,
                    )
                }
                MyAppsUiState(installedApps = installed, isLoading = false)
            }
            // PackageManager lookups are IO; keep them off the main thread.
            .flowOn(Dispatchers.IO)
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), MyAppsUiState())
}
