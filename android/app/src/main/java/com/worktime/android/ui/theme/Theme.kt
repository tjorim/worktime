package com.worktime.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val LightColors = lightColorScheme(
    primary = WorktimeBlue,
    secondary = WorktimeBlue,
    surface = WorktimeSurface,
)

private val DarkColors = darkColorScheme(
    primary = WorktimeBlueDark,
    secondary = WorktimeBlueDark,
)

@Composable
fun WorktimeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = if (isSystemInDarkTheme()) DarkColors else LightColors,
        content = content,
    )
}
