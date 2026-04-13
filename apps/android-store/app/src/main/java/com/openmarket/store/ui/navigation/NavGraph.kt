package com.openmarket.store.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.openmarket.store.ui.screens.home.HomeScreen
import com.openmarket.store.ui.screens.search.SearchScreen
import com.openmarket.store.ui.screens.appdetail.AppDetailScreen
import com.openmarket.store.ui.screens.myapps.MyAppsScreen
import com.openmarket.store.ui.screens.settings.SettingsScreen
import kotlinx.serialization.Serializable

@Serializable object HomeRoute
@Serializable object SearchRoute
@Serializable data class AppDetailRoute(val appId: String)
@Serializable object MyAppsRoute
@Serializable object SettingsRoute

data class BottomNavItem(
    val label: String,
    val icon: @Composable () -> Unit,
    val route: Any,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NavGraph() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()

    val bottomNavItems = listOf(
        BottomNavItem("Home", { Icon(Icons.Default.Home, "Home") }, HomeRoute),
        BottomNavItem("Search", { Icon(Icons.Default.Search, "Search") }, SearchRoute),
        BottomNavItem("My Apps", { Icon(Icons.Default.Apps, "My Apps") }, MyAppsRoute),
        BottomNavItem("Settings", { Icon(Icons.Default.Settings, "Settings") }, SettingsRoute),
    )

    Scaffold(
        bottomBar = {
            NavigationBar {
                bottomNavItems.forEach { item ->
                    val selected = navBackStackEntry?.destination?.hasRoute(item.route::class) == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(item.route) {
                                popUpTo(HomeRoute) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = item.icon,
                        label = { Text(item.label) },
                    )
                }
            }
        }
    ) { padding ->
        NavHost(navController, startDestination = HomeRoute, Modifier.padding(padding)) {
            composable<HomeRoute> { HomeScreen(onAppClick = { navController.navigate(AppDetailRoute(it)) }) }
            composable<SearchRoute> { SearchScreen(onAppClick = { navController.navigate(AppDetailRoute(it)) }) }
            composable<AppDetailRoute> { AppDetailScreen() }
            composable<MyAppsRoute> { MyAppsScreen() }
            composable<SettingsRoute> { SettingsScreen() }
        }
    }
}
