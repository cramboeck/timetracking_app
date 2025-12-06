// Push Notification Service Worker Extension

// Handle push events
self.addEventListener('push', (event) => {
  console.log('[Push SW] Push notification received', event);

  if (!event.data) {
    console.log('[Push SW] No data in push event');
    return;
  }

  let data;
  try {
    data = event.data.json();
  } catch (e) {
    console.error('[Push SW] Failed to parse push data:', e);
    data = {
      title: 'Neue Benachrichtigung',
      body: event.data.text(),
    };
  }

  const options = {
    body: data.body || '',
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/pwa-192x192.png',
    tag: data.tag || 'default',
    vibrate: [100, 50, 100],
    data: data.data || {},
    actions: data.actions || [],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Benachrichtigung', options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Push SW] Notification clicked', event);
  console.log('[Push SW] Notification data:', event.notification.data);

  event.notification.close();

  // Get URL from notification data
  const notificationData = event.notification.data || {};
  const path = notificationData.url || '/';

  // Build full URL
  const urlToOpen = new URL(path, self.location.origin).href;
  console.log('[Push SW] Opening URL:', urlToOpen);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      console.log('[Push SW] Found clients:', windowClients.length);

      // Check if there's already a window open
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin)) {
          console.log('[Push SW] Focusing existing client and navigating');
          // Post message to client to navigate (more reliable than navigate())
          client.postMessage({
            type: 'NAVIGATE_TO',
            url: path
          });
          return client.focus();
        }
      }

      // Open new window if none exists
      console.log('[Push SW] Opening new window');
      return clients.openWindow(urlToOpen);
    })
  );
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
  console.log('[Push SW] Notification closed', event);
});

// Handle push subscription change
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[Push SW] Push subscription changed', event);

  // The subscription has changed, the app needs to re-subscribe
  // This typically happens when the browser's push service rotates keys
  event.waitUntil(
    self.registration.pushManager.subscribe(event.oldSubscription.options).then((subscription) => {
      // Send the new subscription to the server
      // This would need to be handled by posting to the app
      console.log('[Push SW] Re-subscribed successfully');
    }).catch((error) => {
      console.error('[Push SW] Failed to re-subscribe:', error);
    })
  );
});

console.log('[Push SW] Push notification service worker extension loaded');
