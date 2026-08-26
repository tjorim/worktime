package com.worktime.android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp

private val SWATCH_SIZE = 32.dp
private val SELECTED_BORDER_WIDTH = 2.dp
private const val LUMINANCE_THRESHOLD = 0.5f
private const val OPAQUE_ALPHA_MASK = 0xFF000000L

/** A color option in a [ColorSwatchPicker]: [hex] is the stored value, [name] its accessible label. */
data class NamedColor(val hex: String, val name: String)

fun parseHexColor(hex: String): Color =
    runCatching { Color(hex.removePrefix("#").toLong(radix = 16) or OPAQUE_ALPHA_MASK) }.getOrDefault(Color.Gray)

/**
 * A row of selectable color swatches. Selection is conveyed by more than the border alone (a
 * checkmark is drawn on the selected swatch) and each swatch carries an accessible name and
 * selected state, so the picker works with TalkBack and satisfies WCAG 1.4.1 color-independence.
 * Touch targets expand to the 48dp minimum via [minimumInteractiveComponentSize] while the visible
 * swatch stays compact.
 */
@Composable
fun ColorSwatchPicker(colors: List<NamedColor>, selectedHex: String, onSelect: (String) -> Unit) {
    Row(modifier = Modifier.selectableGroup(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        colors.forEach { option ->
            val selected = option.hex == selectedHex
            val swatchColor = parseHexColor(option.hex)
            Box(
                modifier =
                Modifier
                    .minimumInteractiveComponentSize()
                    .selectable(selected = selected, role = Role.RadioButton, onClick = { onSelect(option.hex) })
                    .semantics { contentDescription = option.name }
                    .wrapContentSize(Alignment.Center)
                    .size(SWATCH_SIZE)
                    .clip(CircleShape)
                    .background(color = swatchColor, shape = CircleShape)
                    .border(
                        width = if (selected) SELECTED_BORDER_WIDTH else 0.dp,
                        color = MaterialTheme.colorScheme.onSurface,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (selected) {
                    Icon(
                        imageVector = Icons.Filled.Check,
                        contentDescription = null,
                        tint = if (swatchColor.luminance() > LUMINANCE_THRESHOLD) Color.Black else Color.White
                    )
                }
            }
        }
    }
}
