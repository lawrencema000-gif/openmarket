// OpenMarket Web Push service worker (P2-P).
//
// Receives encrypted payloads from the push service and surfaces them
// as OS notifications. Click-through routes back to the storefront
// using the `url` field on the payload.
//
// Payload shape (matches packages/contracts/src/push.ts#PushPayload):
//   { title: string, body: string, url?: string, tag?: string, type: string }

self.addEventListener("install", (event) => {
  // Activate the new SW as soon as it's installed — no waiting for
  // open tabs to close. Safe because the SW has no UI state to
  // preserve.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch (_) {
    data = { title: "OpenMarket", body: event.data.text() };
  }
  const title = data.title || "OpenMarket";
  const opts = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/badge-72.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl =
    (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((wins) => {
        // Try to focus an existing tab pointing at the storefront
        // before opening a new one.
        for (const win of wins) {
          if (win.url.includes(self.location.origin)) {
            win.focus();
            if ("navigate" in win) win.navigate(targetUrl);
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      }),
  );
});
