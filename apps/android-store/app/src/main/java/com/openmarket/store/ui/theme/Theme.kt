package com.openmarket.store.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.Composable

private val LightColorScheme = lightColorScheme(
    primary = OpenMarketBlue,
    onPrimary = androidx.compose.ui.graphics.Color.White,
    secondary = OpenMarketGreen,
    error = OpenMarketRed,
    background = androidx.compose.ui.graphics.Color.White,
    surface = androidx.compose.ui.graphics.Color.White,
    surfaceVariant = OpenMarketLightGray,
)

private val DarkColorScheme = darkColorScheme(
    primary = OpenMarketBlue,
    secondary = OpenMarketGreen,
    error = OpenMarketRed,
)

@Composable
fun OpenMarketTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
        typography = Typography,
        content = content,
    )
}
