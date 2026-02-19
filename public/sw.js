const scheduledReminders = new Map();

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.type !== "SCHEDULE_SHIFT_REMINDER") return;

  const payload = message.payload;
  if (!payload || typeof payload.triggerAt !== "number") return;

  const delay = payload.triggerAt - Date.now();
  if (delay <= 0) return;

  if (scheduledReminders.has(payload.tag)) {
    clearTimeout(scheduledReminders.get(payload.tag));
  }

  const timeout = setTimeout(() => {
    self.registration
      .showNotification(payload.title ?? "Upcoming shift", {
        body: payload.body,
        tag: payload.tag,
        data: payload.data,
        icon: "/assets/icons/icon-192.png",
        badge: "/assets/icons/icon-192.png",
      })
      .catch((error) => {
        console.error("Failed to show scheduled shift notification", error);
      });

    scheduledReminders.delete(payload.tag);
  }, delay);

  scheduledReminders.set(payload.tag, timeout);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existingClient = clients.find((client) => "focus" in client);
        if (existingClient) {
          return existingClient.focus();
        }

        return self.clients.openWindow("/");
      }),
  );
});
