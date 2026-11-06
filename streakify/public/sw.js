/*
 * Streakify service worker: makes the customer page an installable app and
 * shows push notifications (streak reminders). Kept tiny on purpose.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = { title: "Streak reminder", body: "Keep your streak going!", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag || "streakify",
      data: { url: data.url },
      icon: data.icon,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(url) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});

// A pass-through fetch handler: required by some browsers to offer "Install app".
self.addEventListener("fetch", () => {});
