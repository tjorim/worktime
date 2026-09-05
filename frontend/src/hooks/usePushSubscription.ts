import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { useApiClient } from "@/hooks/useApiClient";
import { readErrorDetail } from "@/utils/apiClient";
import { isPushSupported, urlBase64ToUint8Array } from "@/utils/pushNotifications";
import { logger } from "@/utils/logger";

export interface UsePushSubscriptionReturn {
  /** The browser supports both the service worker and Push APIs. */
  isSupported: boolean;
  /**
   * Whether this device currently has a push subscription registered for the
   * signed-in account. Kept here (rather than each caller polling
   * getActiveSubscription separately) so callers like App.tsx's foreground-reminder
   * fallback always see the post-reconciliation state, not a stale snapshot from
   * before an account-mismatch reconciliation completed.
   */
  hasActiveSubscription: boolean;
  /**
   * Registers a push subscription with the backend so reminders (e.g. an
   * upcoming planned task) arrive even when the app is closed. Best-effort:
   * returns false on any failure (unsupported browser, push not configured
   * server-side, network error) rather than throwing, since the foreground
   * reminder already covers the open-tab case regardless.
   */
  subscribeToPush: () => Promise<boolean>;
  /** Unsubscribes both locally and server-side. Safe to call with no active subscription. */
  unsubscribeFromPush: () => Promise<void>;
  /** The current subscription, if any, without creating one. */
  getActiveSubscription: () => Promise<PushSubscription | null>;
}

/**
 * Manages the browser's Web Push subscription for reminder notifications.
 *
 * Must be used inside a component that also has SettingsProvider, AuthProvider and
 * ToastProvider ancestors (via useApiClient). Push is a strict enhancement on top of
 * the foreground Notification reminder — nothing here is required for the base
 * notifications toggle to work.
 */
export function usePushSubscription(): UsePushSubscriptionReturn {
  const apiFetch = useApiClient();
  const { userId, isAuthenticated } = useAuth();
  const { notifications } = useSettings().settings;
  const [hasActiveSubscription, setHasActiveSubscription] = useState(false);

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
    async (): Promise<boolean> => {
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
        setHasActiveSubscription(true);
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
    setHasActiveSubscription(false);
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

  // Reconciles this device's subscription with whichever account is currently signed
  // in, whenever the account or reminder preferences change (including on mount). A
  // push subscription is a browser/device-level object, not scoped to whichever app
  // account is signed in - on a shared device, a subscription registered by one
  // account would otherwise silently keep belonging to that account's backend row
  // after a different account signs in, suppressing the new account's foreground
  // fallback and risking that account's task details being pushed to a device
  // someone else is now using.
  //
  // Re-upserting (rather than guessing from local state whether ownership already
  // matches) is what actually closes that gap: the backend's upsert is an idempotent
  // no-op when this device is already correctly registered for the signed-in account,
  // and safely reassigns ownership when it isn't. Local heuristics (e.g. a
  // last-known-owner marker) can't tell a pre-existing legitimate subscription apart
  // from a genuinely stale one, so they either leave real leaks unresolved or tear
  // down subscriptions that never needed it - re-upserting has neither failure mode.
  // Never creates a new subscription on its own; it only ever acts on one that already
  // exists (creating one remains an explicit user action via subscribeToPush).
  useEffect(() => {
    // Re-upserting requires an OIDC principal server-side (subscribe/vapid-public-key
    // both gate on require_oidc_principal), so skip entirely when signed out — including
    // while the OIDC session is still being restored on mount, when isAuthenticated is
    // momentarily false. Without this, a device with a leftover browser-level
    // PushSubscription (e.g. from a previous sign-in never cleanly unsubscribed) would
    // hit those endpoints unauthenticated on every load, 401, and trip the API client's
    // session-expired/login-redirect handling for a user who isn't even signed in.
    if (!isAuthenticated) {
      setHasActiveSubscription(false);
      return;
    }
    let cancelled = false;
    void getActiveSubscription().then(async (subscription) => {
      if (cancelled) return;
      if (subscription === null) {
        setHasActiveSubscription(false);
        return;
      }
      if (notifications !== "on") {
        setHasActiveSubscription(true);
        return;
      }
      const registered = await subscribeToPush();
      if (!cancelled) setHasActiveSubscription(registered);
    });
    return () => {
      cancelled = true;
    };
    // Only re-run when these specific values change; getActiveSubscription and
    // subscribeToPush are stable across renders in practice here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, notifications, isAuthenticated]);

  return {
    isSupported: isPushSupported(),
    hasActiveSubscription,
    subscribeToPush,
    unsubscribeFromPush,
    getActiveSubscription,
  };
}
