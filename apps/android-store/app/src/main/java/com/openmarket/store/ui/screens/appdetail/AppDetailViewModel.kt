package com.openmarket.store.ui.screens.appdetail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import com.openmarket.store.data.api.models.AppDetailResponse
import com.openmarket.store.data.api.models.InstallInfo
import com.openmarket.store.data.api.models.ReleaseResponse
import com.openmarket.store.data.api.models.ReviewResponse
import com.openmarket.store.data.local.InstalledAppEntity
import com.openmarket.store.data.local.InstalledAppsDao
import com.openmarket.store.data.repository.AppRepository
import com.openmarket.store.data.repository.DeviceRepository
import com.openmarket.store.installer.DownloadManager
import com.openmarket.store.installer.DownloadState
import com.openmarket.store.installer.InstalledPackages
import com.openmarket.store.installer.PackageInstallerManager
import com.openmarket.store.ui.navigation.AppDetailRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
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
    /** Installed, but a newer release is rolled out to this device. */
    data object UpdateAvailable : InstallState()
    /** User must grant "install unknown apps" to us first. */
    data object NeedsPermission : InstallState()
    /** Resolving release + signed URL. */
    data object Preparing : InstallState()
    /** progress is null while total size is unknown. */
    data class Downloading(val progress: Float?) : InstallState()
    data object Verifying : InstallState()
    data object Installing : InstallState()
    data object Installed : InstallState()
    data class Failed(val error: String) : InstallState()
}

@HiltViewModel
class AppDetailViewModel @Inject constructor(
    private val repository: AppRepository,
    private val deviceRepository: DeviceRepository,
    private val downloadManager: DownloadManager,
    private val installer: PackageInstallerManager,
    private val installedPackages: InstalledPackages,
    private val installedAppsDao: InstalledAppsDao,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val route = savedStateHandle.toRoute<AppDetailRoute>()
    private val appId = route.appId

    private val _uiState = MutableStateFlow(AppDetailUiState())
    val uiState: StateFlow<AppDetailUiState> = _uiState

    private var installJob: Job? = null

    init {
        loadAppDetail()
    }

    fun loadAppDetail() {
        viewModelScope.launch {
            _uiState.value = AppDetailUiState(isLoading = true)

            val appResult = repository.getApp(appId)
            val releasesResult = repository.getAppReleases(appId)
            val reviewsResult = repository.getAppReviews(appId)

            val app = appResult.getOrNull()
            val releases = releasesResult.getOrElse { emptyList() }

            _uiState.value = AppDetailUiState(
                app = app,
                releases = releases,
                reviews = reviewsResult.getOrElse { emptyList() },
                isLoading = false,
                error = appResult.exceptionOrNull()?.message,
                installState = app?.let { resolveInstallState(it.packageName, releases) }
                    ?: InstallState.Idle,
            )
        }
    }

    /**
     * Derive the install button state from the DEVICE's real package
     * state (not the Room mirror, which drifts). Installed-and-current →
     * Installed; installed-but-behind the latest published release →
     * UpdateAvailable (button stays enabled so the update can actually be
     * installed); not installed → Idle. Also reconciles Room so MyApps
     * stops showing apps the user removed elsewhere.
     */
    private suspend fun resolveInstallState(
        packageName: String,
        releases: List<ReleaseResponse>,
    ): InstallState {
        val installedVersion = installedPackages.installedVersionCode(packageName)
        if (installedVersion == null) {
            // Reconcile: the user may have uninstalled outside the store.
            installedAppsDao.deleteByPackageName(packageName)
            return InstallState.Idle
        }
        val latest = releases
            .filter { it.channel == "stable" }
            .maxOfOrNull { it.versionCode }
            ?: releases.maxOfOrNull { it.versionCode }
        return if (latest != null && installedVersion < latest) {
            InstallState.UpdateAvailable
        } else {
            InstallState.Installed
        }
    }

    /** Intent for the "allow installs from this source" settings screen. */
    fun unknownSourcesIntent() = installer.unknownSourcesIntent()

    fun install() {
        val app = _uiState.value.app ?: return
        if (installJob?.isActive == true) return

        if (!installer.canInstallPackages()) {
            setInstallState(InstallState.NeedsPermission)
            return
        }

        installJob = viewModelScope.launch {
            setInstallState(InstallState.Preparing)

            val deviceId = deviceRepository.deviceId()
            val info = repository.getInstallInfo(app.id, deviceId).getOrElse {
                setInstallState(InstallState.Failed("No release is available for this device yet"))
                return@launch
            }
            val expectedSha = info.sha256
            if (expectedSha.isNullOrBlank()) {
                setInstallState(InstallState.Failed("Release is missing its integrity checksum"))
                return@launch
            }
            val download = repository.getDownloadUrl(info.artifactId, deviceId).getOrElse {
                setInstallState(InstallState.Failed(it.message ?: "Could not get a download link"))
                return@launch
            }

            downloadManager
                .downloadApk(
                    url = download.url,
                    expectedSha256 = expectedSha,
                    fileName = "${app.packageName}-${info.versionCode}.apk",
                )
                .collect { state ->
                    when (state) {
                        is DownloadState.Downloading ->
                            setInstallState(InstallState.Downloading(state.progress))
                        is DownloadState.Verifying ->
                            setInstallState(InstallState.Verifying)
                        is DownloadState.Failed ->
                            setInstallState(InstallState.Failed(state.error))
                        is DownloadState.Complete -> {
                            setInstallState(InstallState.Installing)
                            val result = runCatching {
                                installer.install(state.file, app.packageName)
                            }.getOrElse { e ->
                                state.file.delete()
                                setInstallState(InstallState.Failed(e.message ?: "Install failed"))
                                return@collect
                            }
                            state.file.delete()

                            if (result.success) {
                                onInstalled(app, info, deviceId)
                                setInstallState(InstallState.Installed)
                            } else {
                                setInstallState(
                                    InstallState.Failed(result.message ?: "Install failed"),
                                )
                            }
                        }
                    }
                }
        }
    }

    private suspend fun onInstalled(app: AppDetailResponse, info: InstallInfo, deviceId: String) {
        installedAppsDao.insertInstalledApp(
            InstalledAppEntity(
                packageName = app.packageName,
                appId = app.id,
                title = app.listing?.title ?: app.packageName,
                versionName = info.versionName,
                versionCode = info.versionCode,
                iconUrl = app.listing?.iconUrl ?: "",
            ),
        )
        // Library sync is best-effort: it needs a signed-in session and
        // must never fail the install the user just watched succeed.
        repository.recordInstall(app.id, info.versionCode, deviceId)
    }

    private fun setInstallState(state: InstallState) {
        _uiState.value = _uiState.value.copy(installState = state)
    }
}
