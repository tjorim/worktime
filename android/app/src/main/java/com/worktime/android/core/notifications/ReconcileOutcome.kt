package com.worktime.android.core.notifications

/**
 * Distinguishes *why* [reconcilePlannedTaskReminder] didn't reconcile, so callers with a retry
 * mechanism (WorkManager's [androidx.work.ListenableWorker.Result.retry], for
 * [PlannedTaskReminderReconcileWorker]) can retry a transient [FetchFailed] without endlessly
 * retrying a [LoggedOut] wake that no retry will ever fix.
 */
sealed interface ReconcileOutcome {
    /** [ReminderScheduler.reconcile] ran with freshly-fetched data. */
    data object Reconciled : ReconcileOutcome

    /** No session to fetch with -- retrying won't help until the user logs back in. */
    data object LoggedOut : ReconcileOutcome

    /** A fetch failed (network/backend error) -- may well succeed on retry. */
    data object FetchFailed : ReconcileOutcome
}
