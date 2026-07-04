package com.openmarket.store.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [InstalledAppEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun installedAppsDao(): InstalledAppsDao
}
