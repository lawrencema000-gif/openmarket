package com.openmarket.store.data.local

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "installed_apps")
data class InstalledAppEntity(
    @PrimaryKey val packageName: String,
    val appId: String,
    val title: String,
    val versionName: String,
    val versionCode: Int,
    val iconUrl: String,
    val installedAt: Long = System.currentTimeMillis(),
)

@Dao
interface InstalledAppsDao {
    @Query("SELECT * FROM installed_apps ORDER BY installedAt DESC")
    fun getAllInstalledApps(): Flow<List<InstalledAppEntity>>

    @Query("SELECT * FROM installed_apps WHERE packageName = :packageName LIMIT 1")
    suspend fun getInstalledApp(packageName: String): InstalledAppEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertInstalledApp(app: InstalledAppEntity)

    @Delete
    suspend fun deleteInstalledApp(app: InstalledAppEntity)

    @Query("DELETE FROM installed_apps WHERE packageName = :packageName")
    suspend fun deleteByPackageName(packageName: String)
}
