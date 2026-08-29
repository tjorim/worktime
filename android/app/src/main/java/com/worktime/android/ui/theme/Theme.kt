package com.worktime.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.unit.dp

private val LightColors =
    lightColorScheme(
        primary = WorktimePrimary,
        secondary = WorktimePrimary,
        surface = WorktimeSurface
    )

private val DarkColors =
    darkColorScheme(
        primary = WorktimePrimaryDark,
        secondary = WorktimePrimaryDark
    )

// 12dp cards, 16dp prominent summary surfaces; pill shapes stay reserved for filter/status
// chips, which already default to extraLarge in Material 3. See the design system proposal
// in docs/android-audit-2026-08.md.
private val WorktimeShapes =
    Shapes(
        extraSmall = RoundedCornerShape(4.dp),
        small = RoundedCornerShape(8.dp),
        medium = RoundedCornerShape(12.dp),
        large = RoundedCornerShape(16.dp),
        extraLarge = RoundedCornerShape(28.dp)
    )

private val LocalShiftColors = staticCompositionLocalOf { LightShiftColors }

/** 4dp-based spacing scale — see docs/android-audit-2026-08.md's proposed design system. */
object WorktimeSpacing {
    val tight = 4.dp
    val inline = 8.dp
    val compactCard = 12.dp
    val standard = 16.dp
    val section = 24.dp
    val majorSeparation = 32.dp
}

/** Named tokens that live alongside `MaterialTheme` rather than replacing it. */
object WorktimeTheme {
    val shiftColors: ShiftColors
        @Composable
        get() = LocalShiftColors.current
}

@Composable
fun WorktimeTheme(content: @Composable () -> Unit) {
    val darkTheme = isSystemInDarkTheme()
    CompositionLocalProvider(
        LocalShiftColors provides if (darkTheme) DarkShiftColors else LightShiftColors
    ) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColors else LightColors,
            shapes = WorktimeShapes,
            content = content
        )
    }
}
