package com.openmarket.store.installer

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow

/**
 * Terminal result of a PackageInstaller session, delivered by
 * [InstallResultReceiver] and awaited by [PackageInstallerManager].
 */
data class InstallResult(
    val sessionId: Int,
    val success: Boolean,
    val message: String?,
)

/**
 * Process-wide bridge between the manifest-registered broadcast receiver
 * (instantiated by the system, so it can't be constructor-injected) and
 * the coroutine that committed the install session.
 *
 * extraBufferCapacity keeps tryEmit from dropping results when nobody is
 * suspended on the flow at the exact emission instant.
 */
object InstallEvents {
    private val _results = MutableSharedFlow<InstallResult>(extraBufferCapacity = 16)
    val results: SharedFlow<InstallResult> = _results

    fun tryEmit(result: InstallResult) {
        _results.tryEmit(result)
    }
}
