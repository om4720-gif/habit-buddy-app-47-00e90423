self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification("New GUC grade", {
      body: "A new or changed grade is ready in Ritual.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "ritual-guc-grade",
      renotify: false,
      data: { url: "/uni" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/uni", self.location.origin).href;
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
