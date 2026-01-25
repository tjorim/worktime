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


