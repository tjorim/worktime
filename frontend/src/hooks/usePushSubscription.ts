import { useCallback } from "react";
import { useApiClient } from "@/hooks/useApiClient";
import { readErrorDetail } from "@/utils/apiClient";
import { isPushSupported, urlBase64ToUint8Array } from "@/utils/pushNotifications";
import { logger } from "@/utils/logger";

export interface PushReminderSettings {
  leadTimeMinutes: number;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
}

export interface UsePushSubscriptionReturn {
  /** The browser supports both the service worker and Push APIs. */
  isSupported: boolean;
  /**
   * Registers (or updates, by re-calling with new settings) a push
   * subscription with the backend so shift reminders arrive even when the
   * app is closed. Best-effort: returns false on any failure (unsupported
   * browser, push not configured server-side, network error) rather than
   * throwing, since the foreground reminder (useShiftNotifications) already
   * covers the open-tab case regardless.
   */
  subscribeToPush: (settings: PushReminderSettings) => Promise<boolean>;
  /** Unsubscribes both locally and server-side. Safe to call with no active subscription. */
  unsubscribeFromPush: () => Promise<void>;
  /** The current subscription, if any, without creating one. */
  getActiveSubscription: () => Promise<PushSubscription | null>;
}

/**
 * Manages the browser's Web Push subscription for shift-reminder notifications.
 *
 * Must be used inside a component that also has AuthProvider and ToastProvider
 * ancestors (via useApiClient). Push is a strict enhancement on top of the
 * foreground Notification reminder — nothing here is required for the base
 * notifications toggle to work.
 */
export function usePushSubscription(): UsePushSubscriptionReturn {
  const apiFetch = useApiClient();

  const getActiveSubscription = useCallback(async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) return null;
    try {
      const registration = await navigator.serviceWorker.ready;
      return await registration.pushManager.getSubscription();
    } catch (error) {
      logger.warn("Failed to read existing push subscription:", error);
      return null;
    }
  }, []);

  const subscribeToPush = useCallback(
    async (settings: PushReminderSettings): Promise<boolean> => {
      if (!isPushSupported()) return false;

      try {
        const keyResponse = await apiFetch("/api/push/vapid-public-key");
        if (!keyResponse.ok) return false;
        const { publicKey } = (await keyResponse.json()) as { publicKey: string | null };
        if (!publicKey) return false;

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        const isNewSubscription = subscription === null;
        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey),
          });
        }

        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        const subscriptionJson = subscription.toJSON();
        const response = await apiFetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            endpoint: subscriptionJson.endpoint,
            keys: subscriptionJson.keys,
            timezone,
            lead_time_minutes: settings.leadTimeMinutes,
            quiet_hours_start: settings.quietHoursStart,
            quiet_hours_end: settings.quietHoursEnd,
          }),
        });
        if (!response.ok) {
          logger.warn("Failed to register push subscription:", await readErrorDetail(response));
          // Only a subscription created in this call is rolled back - an existing one
          // (e.g. a settings update that failed) is left alone, since the backend most
          // likely already has it registered from a prior successful call. Without this,
          // a fresh browser-side subscription with no backend record would make
          // getActiveSubscription() report "active" while nothing can ever be delivered,
          // silently disabling the foreground fallback too (see App.tsx).
          if (isNewSubscription) {
            try {
              await subscription.unsubscribe();
            } catch (unsubscribeError) {
              logger.warn("Failed to roll back orphaned push subscription:", unsubscribeError);
            }
          }
          return false;
        }
        return true;
      } catch (error) {
        logger.warn("Push subscription failed:", error);
        return false;
      }
    },
    [apiFetch],
  );

  const unsubscribeFromPush = useCallback(async (): Promise<void> => {
    const subscription = await getActiveSubscription();
    if (!subscription) return;

    const endpoint = subscription.endpoint;
    try {
      await subscription.unsubscribe();
    } catch (error) {
      logger.warn("Failed to unsubscribe from the browser's push manager:", error);
    }
    try {
      await apiFetch(`/api/push/subscribe?endpoint=${encodeURIComponent(endpoint)}`, {
        method: "DELETE",
        suppressUnauthorizedRedirect: true,
      });
    } catch (error) {
      logger.warn("Failed to remove push subscription server-side:", error);
    }
  }, [apiFetch, getActiveSubscription]);

  return {
    isSupported: isPushSupported(),
    subscribeToPush,
    unsubscribeFromPush,
    getActiveSubscription,
  };
}
