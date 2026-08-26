package com.worktime.android.ui.components

import androidx.compose.runtime.saveable.Saver
import java.time.LocalDate

/** Saves a [LocalDate] as its ISO-8601 string for `rememberSaveable`. */
val LocalDateSaver: Saver<LocalDate, String> = Saver(save = { it.toString() }, restore = LocalDate::parse)

/** Saves an optional [LocalDate] as its ISO-8601 string (empty when null) for `rememberSaveable`. */
val NullableLocalDateSaver: Saver<LocalDate?, String> =
    Saver(
        save = { it?.toString() ?: "" },
        restore = { value -> value.takeIf(String::isNotEmpty)?.let(LocalDate::parse) }
    )
