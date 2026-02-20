const scheduledReminders = new Map();

const DB_NAME = "worktime-reminders";
const STORE_NAME = "scheduled-reminders";
const DB_VERSION = 1;

const openDatabase = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "tag" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const withStore = async (mode, callback) => {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);

    let callbackResult;
    try {
      callbackResult = callback(store);
    } catch (error) {
      reject(error);
      db.close();
      return;
    }

    transaction.oncomplete = () => {
      db.close();
      resolve(callbackResult);
    };

    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
};

const persistReminder = async (payload) => {
  await withStore("readwrite", (store) => {
    store.put(payload);
  });
};

const deleteReminder = async (tag) => {
  await withStore("readwrite", (store) => {
    store.delete(tag);
  });
};

const getAllReminders = async () => {
  return withStore("readonly", (store) => {
    return new Promise((resolve, reject) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
};

const showReminderNotification = async (payload) => {
  await self.registration.showNotification(payload.title ?? "Upcoming shift", {
    body: payload.body,
    tag: payload.tag,
    data: payload.data,
    icon: "/assets/icons/icon-192.png",
    badge: "/assets/icons/icon-192.png",
  });
};

const clearScheduledTimeout = (tag) => {
  const existingTimeout = scheduledReminders.get(tag);
  if (existingTimeout) {
    clearTimeout(existingTimeout);
    scheduledReminders.delete(tag);
  }
};

const scheduleReminderTimeout = async (payload) => {
  if (!payload || typeof payload.tag !== "string" || typeof payload.triggerAt !== "number") {
    return;
  }

  clearScheduledTimeout(payload.tag);
  await persistReminder(payload);

  const delay = payload.triggerAt - Date.now();
  if (delay <= 0) {
    try {
      await showReminderNotification(payload);
    } catch (error) {
      console.error("Failed to show overdue reminder notification", error);
    } finally {
      await deleteReminder(payload.tag);
      scheduledReminders.delete(payload.tag);
    }
    return;
  }

  const timeout = setTimeout(async () => {
    try {
      await showReminderNotification(payload);
    } catch (error) {
      console.error("Failed to show scheduled shift notification", error);
    } finally {
      await deleteReminder(payload.tag);
      scheduledReminders.delete(payload.tag);
    }
  }, delay);

  scheduledReminders.set(payload.tag, timeout);
};

const restorePersistedReminders = async () => {
  const persisted = await getAllReminders();

  const deduplicated = new Map();
  for (const payload of persisted) {
    if (!payload || typeof payload.tag !== "string") continue;

    const current = deduplicated.get(payload.tag);
    if (!current || payload.triggerAt > current.triggerAt) {
      deduplicated.set(payload.tag, payload);
    }
  }

  for (const payload of deduplicated.values()) {
    await scheduleReminderTimeout(payload);
  }
};

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      try {
        await restorePersistedReminders();
      } catch (error) {
        console.error("Failed to restore persisted reminders", error);
      }
    })(),
  );
});

self.addEventListener("message", (event) => {
  const message = event.data;
  if (!message || message.type !== "SCHEDULE_SHIFT_REMINDER") return;

  const payload = message.payload;
  if (!payload || typeof payload.triggerAt !== "number" || typeof payload.tag !== "string") return;

  event.waitUntil(
    scheduleReminderTimeout(payload).catch((error) => {
      console.error("Failed to schedule shift reminder", error);
    }),
  );
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
