// src/utils/share.ts
// Generic and context-aware sharing utility for Worktime

export interface ShareOptions {
  title?: string;
  text?: string;
  url?: string;
}

/**
 * Share provided title, text and/or URL using the Web Share API with progressive clipboard fallbacks.
 *
 * Attempts navigator.share; if unavailable, writes the URL (or current page URL) to the clipboard; if that is unavailable, attempts a manual textarea copy. Calls `onSuccess` after a successful share or copy, and calls `onError` with an error if all methods fail or an exception occurs.
 *
 * @param options - Share options containing optional `title`, `text` and `url`
 * @param onSuccess - Optional callback invoked after a successful share or copy
 * @param onError - Optional callback invoked with an error when sharing fails
 */
export async function share(
  options: ShareOptions,
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
) {
  try {
    if (navigator.share) {
      await navigator.share(options);
      onSuccess?.();
    } else if (navigator.clipboard) {
      await navigator.clipboard.writeText(options.url || window.location.href);
      onSuccess?.();
    } else {
      // Fallback: manual copy to clipboard using temporary textarea
      const textToCopy = options.url || window.location.href;
      try {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        onSuccess?.();
      } catch {
        // Ultimate fallback: let the caller handle this through onError
        onError?.(
          new Error("Sharing not supported in this browser. Please copy the URL manually."),
        );
      }
    }
  } catch (err) {
    onError?.(err);
  }
}

/**
 * Initiates sharing of Worktime's title, promotional text and the current page URL.
 *
 * Initiates a share of the app with the title "Worktime", a short promotional message and the current origin + pathname, and calls the provided callbacks after success or failure.
 *
 * @param onSuccess - Optional callback invoked when the share or copy operation succeeds
 * @param onError - Optional callback invoked with an error when all sharing methods fail
 */
export function shareApp(onSuccess?: () => void, onError?: (err: unknown) => void) {
  share(
    {
      title: "Worktime",
      text: "Check out Worktime for 24/7 shift tracking and time-off management!",
      url: `${window.location.origin}${window.location.pathname}`,
    },
    onSuccess,
    onError,
  );
}

/**
 * Share the app with contextual text and an optional deep-link URL.
 *
 * @param contextText - Contextual text to include in the shared message (e.g. "Team 3 schedule")
 * @param onSuccess - Optional callback invoked when the share or copy operation succeeds
 * @param onError - Optional callback invoked with an error when the share or copy operation fails
 * @param queryParams - Optional record of query parameter names and values to append to the current URL for deep linking
 */
export function shareAppWithContext(
  contextText: string,
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
  queryParams?: Record<string, string>,
) {
  let shareUrl = window.location.href;

  // Add query parameters for deep linking if provided
  if (queryParams && Object.keys(queryParams).length > 0) {
    const url = new URL(window.location.href);
    Object.entries(queryParams).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
    shareUrl = url.toString();
  }

  share(
    {
      title: "Worktime",
      text: `Worktime: ${contextText}`,
      url: shareUrl,
    },
    onSuccess,
    onError,
  );
}

/**
 * Shares a link to the schedule view
 *
 * @param onSuccess - Optional callback invoked when sharing or copying completes successfully
 * @param onError - Optional callback invoked with an error if all sharing methods fail
 * @param view - Optional view mode to deep-link to ("today" or "week")
 */
export function shareTeamSchedule(
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
  view?: "today" | "week",
) {
  const queryParams: Record<string, string> = {
    tab: "schedule",
  };

  if (view) {
    queryParams.view = view;
  }

  shareAppWithContext(
    "Schedule",
    onSuccess,
    onError,
    queryParams,
  );
}

/**
 * Shares today's view with all teams
 *
 * @param onSuccess - Optional callback invoked after a successful share or copy
 * @param onError - Optional callback invoked with an error if sharing fails
 * @param view - Optional view mode to deep-link to ("today" or "week")
 */
export function shareTodayView(
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
  view?: "today" | "week",
) {
  const queryParams: Record<string, string> = { tab: "schedule" };
  
  if (view) {
    queryParams.view = view;
  }

  shareAppWithContext("Today's shift schedule - see who's working now", onSuccess, onError, queryParams);
}

/**
 * Share the transfer schedule view for a given team.
 *
 * @param teamNumber - The team number to include in the deep link
 * @param onSuccess - Optional callback invoked after a successful share or copy
 * @param onError - Optional callback invoked with an error if sharing fails
 */
export function shareTransferView(
  teamNumber: number,
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
) {
  shareAppWithContext(`Team ${teamNumber} transfer schedule`, onSuccess, onError, {
    tab: "transfer",
    team: teamNumber.toString(),
  });
}
