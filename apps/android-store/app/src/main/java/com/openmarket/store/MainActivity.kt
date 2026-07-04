package com.openmarket.store

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import com.openmarket.store.ui.navigation.NavGraph
import com.openmarket.store.ui.theme.OpenMarketTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    companion object {
        const val EXTRA_NAV_TARGET = "com.openmarket.store.NAV_TARGET"
        const val NAV_TARGET_MY_APPS = "my_apps"
    }

    private val requestNotificationPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* best effort */ }

    private var navTarget by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        navTarget = intent?.getStringExtra(EXTRA_NAV_TARGET)
        maybeRequestNotificationPermission()
        setContent {
            OpenMarketTheme {
                NavGraph(
                    navTarget = navTarget,
                    onNavTargetHandled = { navTarget = null },
                )
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTop: a notification tap on the existing task delivers here.
        setIntent(intent)
        navTarget = intent.getStringExtra(EXTRA_NAV_TARGET)
    }

    /**
     * Android 13+ gates notifications behind a runtime permission. Without
     * this request the update-available notification would silently never
     * post on a fresh install (targetSdk 35).
     */
    private fun maybeRequestNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(
            this,
            Manifest.permission.POST_NOTIFICATIONS,
        ) == PackageManager.PERMISSION_GRANTED
        if (!granted) {
            requestNotificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }
}
