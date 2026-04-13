package com.openmarket.store.di

import com.openmarket.store.BuildConfig
import com.openmarket.store.data.api.OpenMarketApi
import com.openmarket.store.data.repository.AppRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.contentnegotiation.*
import io.ktor.serialization.kotlinx.json.*
import kotlinx.serialization.json.Json
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideHttpClient(): HttpClient {
        return HttpClient(OkHttp) {
            install(ContentNegotiation) {
                json(Json {
                    ignoreUnknownKeys = true
                    isLenient = true
                })
            }
        }
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
}
