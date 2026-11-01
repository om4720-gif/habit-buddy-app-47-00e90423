// Handles every push Ritual sends: grade alerts (no payload) and deadline
// reminders (JSON payload with title/body/url/tag).
self.addEventListener("push", (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  const options = payload
    ? {
        body: payload.body || "",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: payload.tag || "ritual-push",
        renotify: true,
        data: { url: payload.url || "/" },
      }
    : {
        body: "A new or changed grade is ready in Ritual.",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "ritual-guc-grade",
        renotify: false,
        data: { url: "/uni" },
      };
  const title = payload ? payload.title || "Ritual" : "New GUC grade";
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) {
        await existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
