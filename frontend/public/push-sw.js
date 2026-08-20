// Extra service-worker logic for Web Push shift reminders, loaded into the
// generated workbox service worker via `workbox.importScripts` (vite.config.ts)
// rather than a full injectManifest rewrite, so precaching/update-toast
// behavior (see src/components/PwaUpdateToast.tsx) is untouched.

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const title = payload.title || "Worktime";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body,
      tag: payload.tag || "shift-reminder",
      icon: "/assets/icons/icon-192.png",
      badge: "/assets/icons/icon-192.png",
      data: { url: payload.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
      return undefined;
    }),
  );
});
