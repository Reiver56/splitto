self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "Splitto", body: "" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: "Splitto", body: event.data.text() };
    }
  }

  const options = {
    body: data.body || "",
    tag: data.tag || undefined,
    icon: "/static/icons/icon.svg",
    badge: "/static/icons/icon.svg",
  };

  event.waitUntil(self.registration.showNotification(data.title || "Splitto", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clientsList) => {
      for (const client of clientsList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
