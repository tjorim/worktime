import { logger } from "@/utils/logger";

// Shared across hook instances: revocation must also cancel in-flight registration.
let pushRegistrationGeneration = 0;
export function getPushRegistrationGeneration(): number {
  return pushRegistrationGeneration;
}
export function invalidatePushRegistration(): void {
  pushRegistrationGeneration += 1;
}

/**
 * Convert a URL-safe base64 VAPID public key (as returned by the backend)
 * into the raw Uint8Array PushManager.subscribe()'s applicationServerKey expects.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replaceAll("-", "+").replaceAll("_", "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/** True when the browser supports both the service worker and Push APIs. */
export function isPushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Revoke this browser before discarding the account credentials. Never starts sign-in. */
export async function clearPushSubscription(accessToken: string | null): Promise<void> {
  invalidatePushRegistration();
  if (!isPushSupported()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    // Local revocation is independent of network/auth failures (including an expired token).
    const localCleanup = subscription.unsubscribe().catch((error: unknown) => {
      logger.warn("Failed to unsubscribe browser push:", error);
    });
    try {
      if (accessToken) {
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: AbortSignal.timeout(5000),
        });
      }
    } finally {
      await localCleanup;
    }
  } catch (error) {
    logger.warn("Failed to clear push subscription:", error);
  }
}
