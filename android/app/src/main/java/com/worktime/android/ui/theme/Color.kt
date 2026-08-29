package com.worktime.android.ui.theme

import androidx.compose.ui.graphics.Color

// --- Brand ---
// Matches the web app's --wt-primary-color (frontend/src/styles/_variables.scss), which
// stays pinned across light/dark there. Android's dark scheme still needs a lighter tone for
// contrast on dark surfaces, so WorktimePrimaryDark mirrors the accent web itself switches to
// in dark mode (--wt-month-calendar-today-border: #6ea8fe) rather than inventing a new color.
val WorktimePrimary = Color(0xFF0D6EFD)
val WorktimePrimaryDark = Color(0xFF6EA8FE)
val WorktimeSurface = Color(0xFFF7F9FC)

/** A shift-status color pair, analogous to a Material 3 container/on-container role. */
data class ShiftColorPair(val container: Color, val onContainer: Color)

/** Per-shift-type color roles, mirrored from web's `--wt-shift-*`/`--wt-shift-*-text` pairs. */
data class ShiftColors(
    val morning: ShiftColorPair,
    val late: ShiftColorPair,
    val day: ShiftColorPair,
    val night: ShiftColorPair,
    val off: ShiftColorPair
)

// Light values mirror frontend/src/styles/_variables.scss's :root --wt-shift-* declarations.
val LightShiftColors =
    ShiftColors(
        morning = ShiftColorPair(Color(0xFF1976D2), Color(0xFFFFFFFF)),
        late = ShiftColorPair(Color(0xFFBF360C), Color(0xFFFFFFFF)),
        day = ShiftColorPair(Color(0xFFF57C00), Color(0xFF111111)),
        night = ShiftColorPair(Color(0xFF7B1FA2), Color(0xFFFFFFFF)),
        off = ShiftColorPair(Color(0xFF616161), Color(0xFFFFFFFF))
    )

// Dark values mirror the same file's [data-bs-theme="dark"] --wt-shift-* declarations, already
// contrast-audited there (see the AA-pass comments next to --wt-shift-day-text/-off-text).
val DarkShiftColors =
    ShiftColors(
        morning = ShiftColorPair(Color(0xFF1565C0), Color(0xFFE3F2FD)),
        late = ShiftColorPair(Color(0xFF8D3200), Color(0xFFFFE0B2)),
        day = ShiftColorPair(Color(0xFFB85500), Color(0xFFFFFFFF)),
        night = ShiftColorPair(Color(0xFF4527A0), Color(0xFFEDE7F6)),
        off = ShiftColorPair(Color(0xFF616161), Color(0xFFFFFFFF))
    )

/** Resolves a `ShiftSummary.code` ("M"/"L"/"D"/"N"/"O") to its color pair. */
fun ShiftColors.forShiftCode(code: String): ShiftColorPair = when (code) {
    "M" -> morning
    "L" -> late
    "D" -> day
    "N" -> night
    else -> off
}
