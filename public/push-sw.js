/* BCradio push notification handlers. Imported into the generated service worker. */
/* eslint-disable no-undef */

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "BCradio", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "BCradio";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-512.png",
    badge: payload.badge || "/icon-512.png",
    tag: payload.tag || "bcradio-broadcast",
    renotify: true,
    data: { url: payload.url || "/" },
    vibrate: [120, 60, 120],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          try {
            await client.navigate(url);
          } catch {
            /* noop */
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })(),
  );
});
