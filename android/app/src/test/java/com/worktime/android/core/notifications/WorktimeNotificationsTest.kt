package com.worktime.android.core.notifications

import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import io.mockk.MockKMatcherScope
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkConstructor
import io.mockk.mockkStatic
import io.mockk.slot
import io.mockk.unmockkAll
import io.mockk.verify
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Before
import org.junit.Test

private fun MockKMatcherScope.builder() = anyConstructed<NotificationCompat.Builder>()

class WorktimeNotificationsTest {
    private val context: Context = mockk(relaxed = true)
    private val manager: NotificationManagerCompat = mockk(relaxed = true)

    @Before
    fun setUp() {
        mockkStatic(NotificationManagerCompat::class)
        every { NotificationManagerCompat.from(any()) } returns manager
        every { context.packageName } returns "com.worktime.android"
        every { context.checkPermission(any(), any(), any()) } returns PackageManager.PERMISSION_GRANTED
    }

    @After
    fun tearDown() {
        unmockkAll()
    }

    @Test
    fun `cancelAll removes only the reminder notifications and leaves other app notifications alone`() {
        WorktimeNotifications(context).cancelAll()

        WorktimeNotifications.REMINDER_NOTIFICATION_IDS.forEach { verify(exactly = 1) { manager.cancel(it) } }
        verify(exactly = 0) { manager.cancelAll() }
    }

    @Test
    fun `reminder ids exclude the background sync foreground notification`() {
        // 1004 is the WorkManager foreground notification; cancelling it would kill a running reconcile.
        assertFalse(1004 in WorktimeNotifications.REMINDER_NOTIFICATION_IDS)
    }

    @Test
    fun `planned task reminder hides the task name behind a generic public version`() {
        val titles = mutableListOf<CharSequence>()
        val texts = mutableListOf<CharSequence>()
        val visibility = slot<Int>()
        val publicVersion = slot<Notification>()
        mockkConstructor(NotificationCompat.Builder::class)
        every { builder().setContentTitle(capture(titles)) } answers { self as NotificationCompat.Builder }
        every { builder().setContentText(capture(texts)) } answers { self as NotificationCompat.Builder }
        every { builder().setVisibility(capture(visibility)) } answers { self as NotificationCompat.Builder }
        every { builder().setPublicVersion(capture(publicVersion)) } answers { self as NotificationCompat.Builder }
        val publicNotification = mockk<Notification>(relaxed = true)
        val fullNotification = mockk<Notification>(relaxed = true)
        every { builder().build() } returnsMany listOf(publicNotification, fullNotification)

        WorktimeNotifications(context).showPlannedTaskReminder("Dentist starts at 10:00")

        assertEquals(NotificationCompat.VISIBILITY_PRIVATE, visibility.captured)
        assertSame(publicNotification, publicVersion.captured)
        // The public version is built first and carries no task text.
        assertEquals(listOf<CharSequence>(WorktimeNotifications.PUBLIC_TITLE, "Starting soon"), titles)
        assertEquals(
            listOf<CharSequence>(WorktimeNotifications.PUBLIC_TEXT_PLANNED_TASK, "Dentist starts at 10:00"),
            texts
        )
    }
}
