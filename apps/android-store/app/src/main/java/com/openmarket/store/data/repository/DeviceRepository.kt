package com.openmarket.store.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

private val Context.deviceDataStore: DataStore<Preferences> by preferencesDataStore(name = "device")

/**
 * Stable, opaque per-install device identity.
 *
 * Used as the rollout-cohort subject for /api/device calls and as the
 * deviceFingerprintHash when recording installs — one identity for both
 * so cohort assignment and install attribution agree. It's a random
 * UUID, not a hardware fingerprint: uninstalling the store resets it.
 */
@Singleton
class DeviceRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val deviceIdKey = stringPreferencesKey("device_id")
    private val mutex = Mutex()

    suspend fun deviceId(): String {
        context.deviceDataStore.data.first()[deviceIdKey]?.let { return it }
        return mutex.withLock {
            // Re-check inside the lock — another caller may have won.
            context.deviceDataStore.data.first()[deviceIdKey] ?: run {
                val id = "om-" + UUID.randomUUID().toString().replace("-", "")
                context.deviceDataStore.edit { it[deviceIdKey] = id }
                id
            }
        }
    }
}
