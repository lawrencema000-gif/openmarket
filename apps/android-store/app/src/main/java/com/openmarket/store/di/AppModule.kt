package com.openmarket.store.di

import android.content.Context
import androidx.room.Room
import com.openmarket.store.BuildConfig
import com.openmarket.store.data.api.OpenMarketApi
import com.openmarket.store.data.local.AppDatabase
import com.openmarket.store.data.local.InstalledAppsDao
import com.openmarket.store.data.repository.AppRepository
import com.openmarket.store.data.repository.AuthRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.http.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideHttpClient(authRepository: AuthRepository): HttpClient {
        val client = HttpClient(OkHttp) {
            // Non-2xx responses throw, so .body() never silently
            // deserializes an error payload into a success shape.
            expectSuccess = true
            install(ContentNegotiation) {
                json(Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                })
            }
            install(HttpTimeout) {
                connectTimeoutMillis = 15_000
                requestTimeoutMillis = 60_000
            }
        }
        // Attach the session token (when signed in) to every API call.
        client.plugin(HttpSend).intercept { request ->
            val token = authRepository.authToken.firstOrNull()
            if (!token.isNullOrBlank() && !request.headers.contains(HttpHeaders.Authorization)) {
                request.headers.append(HttpHeaders.Authorization, "Bearer $token")
            }
            execute(request)
        }
        return client
    }

    @Provides
    @Singleton
    fun provideOpenMarketApi(client: HttpClient): OpenMarketApi {
        return OpenMarketApi(client, BuildConfig.API_BASE_URL)
    }

    @Provides
    @Singleton
    fun provideAppRepository(api: OpenMarketApi): AppRepository {
        return AppRepository(api)
    }

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(context, AppDatabase::class.java, "openmarket.db")
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideInstalledAppsDao(database: AppDatabase): InstalledAppsDao {
        return database.installedAppsDao()
    }
}
