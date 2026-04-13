package com.openmarket.store.data.repository

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auth")

@Singleton
class AuthRepository @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private val authTokenKey = stringPreferencesKey("auth_token")
    private val userIdKey = stringPreferencesKey("user_id")

    val authToken: Flow<String?> = context.dataStore.data.map { it[authTokenKey] }
    val userId: Flow<String?> = context.dataStore.data.map { it[userIdKey] }

    suspend fun saveAuthToken(token: String, userId: String) {
        context.dataStore.edit { prefs ->
            prefs[authTokenKey] = token
            prefs[userIdKey] = userId
        }
    }

    suspend fun clearAuth() {
        context.dataStore.edit { prefs ->
            prefs.remove(authTokenKey)
            prefs.remove(userIdKey)
        }
    }
}
